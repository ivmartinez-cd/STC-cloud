import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { EwsSession } from "../application/ports/ews-session-store";
import type { AgentUseCases } from "./agent-wiring";
import { deviceOriginOf } from "../application/use-cases/ews-gateway-use-cases";
import { GATEWAY_PREFIX, isNavigation, isWriteMethod, pathFromUrl, requestHeadersFor, responseHeadersFor } from "./ews-gateway-http";

/** Cookie del GATEWAY (no del equipo): sólo un id opaco de sesión. Distinta de la del portal para que no se pisen. */
const SESSION_COOKIE = "stc_ews";

type GatewayRequest = FastifyRequest & { ewsSession?: EwsSession; ewsSessionId?: string };

/**
 * Rutas del gateway de EWS remoto: el origen aparte (`ews.<dominio>`, que
 * nginx mapea a `/__ews/*`) por el que el operador NAVEGA la web embebida de
 * un equipo, en vez de mirar una sola página.
 *
 * Por qué un hostname propio y no un prefijo del portal: así las rutas
 * absolutas del firmware (`/sws/app/…`) resuelven solas y no hay que
 * reescribir HTML ni JavaScript de cada marca, y además las cookies del
 * gateway quedan en otro origen que las del portal.
 */
export function registerEwsGatewayRoutes(fastify: FastifyInstance, redis: Redis, uc: AgentUseCases) {
  // Plugin encapsulado para que el parser de abajo NO afecte al resto de la API.
  void fastify.register(async (instance) => {
    // El cuerpo se relaya tal cual llegó: un formulario de EWS puede venir
    // `x-www-form-urlencoded`, multipart o XML, y Fastify sin este parser
    // rechazaría con 415 todo lo que no sea JSON. Parsearlo sería peor:
    // reserializar cambia bytes y hay firmware que valida longitudes.
    instance.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    instance.addHook("onSend", stripAppSecurityHeaders);
    registerGatewayEndpoints(instance, redis, uc);
  });
}

/**
 * Cabeceras que `@fastify/helmet` pone en TODA la app y que acá hay que sacar.
 * Están pensadas para el portal —una SPA nuestra, moderna— y son incompatibles
 * con el firmware de una impresora:
 *
 * - `X-Content-Type-Options: nosniff` bloquea cualquier `<script>` que no venga
 *   con un content-type de JavaScript, y estos equipos sirven casi todo su JS
 *   como `text/html`.
 * - `Content-Security-Policy: script-src 'self'` (sin `unsafe-inline`) mata
 *   además todos los scripts inline, y las páginas del firmware están hechas
 *   de eso: la home de SyncThru es un `<script>` que redirige y el resto arma
 *   la UI entera con `document.write`.
 *
 * Con las dos puestas no se ejecuta una sola línea de JS del equipo y la
 * pestaña queda en blanco. El aislamiento de este contenido no lo dan estas
 * cabeceras sino el hostname propio del gateway: nada de lo que sirve tiene
 * acceso a las cookies ni al DOM del portal.
 */
const APP_SECURITY_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-type-options",
  "x-frame-options",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
];

function stripAppSecurityHeaders(_request: FastifyRequest, reply: FastifyReply, payload: unknown, done: (err: Error | null, payload?: unknown) => void) {
  for (const header of APP_SECURITY_HEADERS) reply.removeHeader(header);
  done(null, payload);
}

type Sessions = ReturnType<AgentUseCases["ewsSessions"]>;

/** El ticket ES la credencial: un solo uso, 60 s de vida, y se canjea por la cookie de sesión. */
const ticketAuthFor = (sessions: Sessions) => async (request: FastifyRequest, reply: FastifyReply) => {
  const ticket = (request.query as { ticket?: string }).ticket;
  const sessionId = ticket ? await sessions.consumeTicket(ticket) : null;
  if (!sessionId) return reply.code(403).type("text/plain; charset=utf-8").send("Ticket inválido o vencido. Volvé a abrir la EWS desde el portal.");
  (request as GatewayRequest).ewsSessionId = sessionId;
};

/**
 * Toda petición posterior viaja con la cookie del gateway; la sesión vive en
 * Redis y expira por inactividad.
 *
 * 401 y no 403: la sesión del gateway venció, no es que falten permisos. El
 * 401 que manda la PROPIA impresora (Basic auth) no pasa por acá — ese viaja
 * en la respuesta relayada y el navegador lo resuelve con su prompt.
 */
const sessionAuthFor = (sessions: Sessions) => async (request: FastifyRequest, reply: FastifyReply) => {
  const sessionId = (request.cookies ?? {})[SESSION_COOKIE];
  const session = sessionId ? await sessions.read(sessionId) : null;
  if (!session) return reply.code(401).type("text/plain; charset=utf-8").send("La sesión de EWS venció o se cerró. Volvé a abrirla desde el portal.");
  Object.assign(request as GatewayRequest, { ewsSession: session, ewsSessionId: sessionId });
};

function registerOpenEndpoint(fastify: FastifyInstance, sessions: Sessions) {
  fastify.get(`${GATEWAY_PREFIX}/__stc/open`, { preHandler: ticketAuthFor(sessions) }, async (request, reply) => {
    const sessionId = (request as GatewayRequest).ewsSessionId!;
    // `Secure`+`HttpOnly`+`SameSite=Lax`: el id de sesión no lo lee ningún
    // script, y no viaja en peticiones cruzadas que no sean navegación.
    reply.setCookie(SESSION_COOKIE, sessionId, { path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    return reply.redirect("/", 302);
  });
}

function registerGatewayEndpoints(fastify: FastifyInstance, redis: Redis, uc: AgentUseCases) {
  const sessions = uc.ewsSessions(redis);
  const relay = uc.relayEws(redis);

  registerOpenEndpoint(fastify, sessions);

  fastify.route({
    method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"],
    url: `${GATEWAY_PREFIX}/*`,
    // El límite global de la API (100/min) es para llamadas de la SPA; acá una
    // sola pantalla del EWS dispara cientos de pedidos —cada GIF de un botón
    // es uno— y el límite los cortaba con 429 dejando la app colgada en
    // "Loading...". Se sube, no se saca: sigue siendo un tope, y la sesión
    // (autenticada, atada a un equipo y con vencimiento) es el control real.
    config: { rateLimit: { max: 1000, timeWindow: "1 minute" } },
    preHandler: sessionAuthFor(sessions),
    handler: (request, reply) => proxyToDevice(request as GatewayRequest, reply, relay),
  });
}

/**
 * Se audita lo que le importa a un auditor: qué pantalla se abrió y toda
 * escritura. Los recursos de una página (CSS, imágenes) no — serían cientos de
 * filas por pantalla y taparían justo lo que hay que mirar.
 */
function relayInputFor(request: GatewayRequest, origin: string) {
  const session = request.ewsSession!;
  const body = request.body as Buffer | undefined;
  const headers = request.headers as Record<string, unknown>;
  return {
    sessionId: request.ewsSessionId!,
    session,
    method: request.method,
    path: pathFromUrl(request.url),
    headers: requestHeadersFor(headers, session.cookies, origin),
    bodyBase64: Buffer.isBuffer(body) && body.length ? body.toString("base64") : undefined,
    audit: isWriteMethod(request.method) || isNavigation(headers),
  };
}

async function proxyToDevice(request: GatewayRequest, reply: FastifyReply, relay: ReturnType<AgentUseCases["relayEws"]>) {
  const origin = deviceOriginOf(request.ewsSession!);
  const result = await relay.execute(relayInputFor(request, origin));
  return reply
    .code(result.status)
    .headers(responseHeadersFor(result.headers, origin))
    .send(Buffer.from(result.bodyBase64, "base64"));
}
