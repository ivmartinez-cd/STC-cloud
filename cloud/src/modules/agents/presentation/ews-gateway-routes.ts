import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { EwsSession } from "../application/ports/ews-session-store";
import type { AgentUseCases } from "./agent-wiring";
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
    registerGatewayEndpoints(instance, redis, uc);
  });
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

function registerGatewayEndpoints(fastify: FastifyInstance, redis: Redis, uc: AgentUseCases) {
  const sessions = uc.ewsSessions(redis);
  const relay = uc.relayEws(redis);

  fastify.get(`${GATEWAY_PREFIX}/__stc/open`, { preHandler: ticketAuthFor(sessions) }, async (request, reply) => {
    const sessionId = (request as GatewayRequest).ewsSessionId!;
    // `Secure`+`HttpOnly`+`SameSite=Lax`: el id de sesión no lo lee ningún
    // script, y no viaja en peticiones cruzadas que no sean navegación.
    reply.setCookie(SESSION_COOKIE, sessionId, { path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    return reply.redirect("/", 302);
  });

  fastify.route({
    method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"],
    url: `${GATEWAY_PREFIX}/*`,
    preHandler: sessionAuthFor(sessions),
    handler: (request, reply) => proxyToDevice(request as GatewayRequest, reply, relay),
  });
}

/** El agente sólo habla HTTP/HTTPS contra la IP; el origen se arma acá para reescribir `Referer` y `Location`. */
function deviceOriginOf(session: EwsSession): string {
  return `${session.protocol ?? "http"}://${session.ip}`;
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
