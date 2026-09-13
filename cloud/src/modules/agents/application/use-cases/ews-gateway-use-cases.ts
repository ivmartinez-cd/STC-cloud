import crypto from "crypto";
import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { EwsProxyGateway, EwsProxyResponse } from "../ports/ews-proxy-gateway";
import type { EwsSession, EwsSessionStore } from "../ports/ews-session-store";
import type { Actor } from "../dtos/agent-dtos";
import { RemoteActionError, assertEligibleEwsDevice } from "./remote-use-cases";
import { mergeCookieJar as mergeJar } from "../../../../services/ewsGatewayService";

/** Igual que el visor de una página: lo que tarde más que esto es un agente caído, no un equipo lento. */
const RELAY_TIMEOUT_MS = 20_000;

/**
 * Cuántas peticiones pueden ir a la vez contra UN equipo.
 *
 * El navegador abre 6-10 conexiones en paralelo para cargar una página, y el
 * agente las dispara todas juntas. Un servidor web embebido de impresora no es
 * nginx: con esa andanada encima se arrastra, las peticiones se pasan del
 * timeout del agente (10 s) y vuelven 502. Pasó con el SyncThru de ISSN — los
 * tres archivos más grandes de la página (jquery.layout.js, swsHomeInclude.js,
 * swsIncludeCommon.js) fallaban siempre y la app se quedaba en "Loading...",
 * mientras que pedidos de a uno respondían en menos de un segundo.
 *
 * Con 3 en vuelo la página sigue cargando rápido (cada recurso tarda décimas)
 * y el equipo no se satura. Es por sesión, o sea por equipo: dos operadores
 * mirando equipos distintos no se estorban. Verificado: 54/54 en 200.
 */
export const MAX_CONCURRENT_PER_SESSION = 3;

/**
 * Semáforo FIFO por sesión: nunca más de `MAX_CONCURRENT_PER_SESSION` en
 * vuelo, y el lugar que se libera pasa DIRECTO al que más tiempo lleva
 * esperando (no a un carril fijo, que dejaba pedidos chicos trabados detrás
 * de un JS grande aunque hubiera lugar).
 *
 * Vive en memoria del proceso (como los resolvers de `ewsProxyService`): si
 * dos réplicas atienden la misma sesión, cada una limita su propia parte, que
 * es suficiente. La entrada se borra sola cuando no queda nada en vuelo.
 */
const slotsBySession = new Map<string, { active: number; waiting: Array<() => void> }>();

export async function throttledBySession<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  const slots = slotsBySession.get(sessionId) ?? { active: 0, waiting: [] };
  slotsBySession.set(sessionId, slots);
  if (slots.active < MAX_CONCURRENT_PER_SESSION) slots.active += 1;
  else await new Promise<void>((wake) => slots.waiting.push(wake));
  try {
    return await run();
  } finally {
    const next = slots.waiting.shift();
    // El lugar se traspasa sin bajar `active`: así nadie recién llegado se cuela delante del que esperaba.
    if (next) next();
    else if (--slots.active === 0) slotsBySession.delete(sessionId);
  }
}

export interface OpenEwsSessionInput extends Actor {
  agentId: string;
  deviceId: string;
  role: string;
}

/**
 * Abre una sesión de navegación contra la EWS de un equipo y devuelve el
 * ticket con el que el navegador cruza al origen del gateway.
 *
 * La IP se resuelve ACÁ, desde `devices`, y queda congelada en la sesión: a
 * partir de ese momento el navegador sólo maneja un identificador opaco, y
 * ninguna petición suya puede cambiar contra qué equipo se está hablando.
 */
export class OpenEwsSessionUseCase {
  constructor(
    private readonly repo: AgentPortalRepository,
    private readonly sessions: EwsSessionStore,
    private readonly audit: AuditLogWriter,
    private readonly agents: AgentRepository
  ) {}

  async execute(input: OpenEwsSessionInput): Promise<{ ticket: string }> {
    const device = await assertEligibleEwsDevice(this.repo, input.agentId, input.deviceId);
    const agent = await this.agents.findById(input.agentId);
    const sessionId = await this.sessions.create({
      userId: input.userId ?? "", role: input.role, agentId: input.agentId, deviceId: input.deviceId,
      clientId: agent?.client_id ?? null, ip: device.ip_address, label: device.model ?? device.serial_number ?? device.ip_address,
    });
    await this.audit.write({
      action: "REMOTE_EWS_SESSION_OPEN", targetId: input.agentId, clientId: agent?.client_id ?? null,
      userId: input.userId, ipAddress: input.ipAddress,
      metadata: { device_id: input.deviceId, device_ip: device.ip_address },
    });
    return { ticket: await this.sessions.mintTicket(sessionId) };
  }
}

/** El agente sólo habla HTTP/HTTPS contra la IP; el origen se arma con el protocolo que la sesión ya acertó. */
export function deviceOriginOf(session: EwsSession): string {
  return `${session.protocol ?? "http"}://${session.ip}`;
}

/** Node ya baja los nombres a minúscula en el agente; esto es por si algún día llegan de otro transporte. */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name);
  return found ? headers[found] : undefined;
}

/**
 * Detecta que el equipo redirige a SÍ MISMO pero por el otro esquema —el
 * clásico "esto se habla por HTTPS" de un firmware con TLS obligatorio.
 *
 * Hay que verlo acá porque el `Location` absoluto se convierte en ruta
 * relativa antes de llegar al navegador (si no, saldría hacia la IP de la LAN
 * del cliente), y esa reescritura descarta el esquema: sin esto el navegador
 * volvería a pedir la misma ruta, el gateway volvería a hablar por el
 * protocolo viejo y el equipo volvería a redirigir. Es la explicación más
 * plausible del bucle visto el 13/09/2026 en el SyncThru de ISSN (30 pedidos
 * a `/` en 17 s, todos 302), aunque no se pudo reproducir con curl; el fix es
 * correcto por sí mismo. La sesión aprende el esquema igual que aprende el
 * jar de cookies, y el reintento es invisible para el operador.
 *
 * Un puerto no estándar (`https://ip:8443/`) no se toma como cambio de
 * esquema: el agente sólo habla en 80/443 y cambiar a ciegas empeoraría.
 */
export function schemeSwitchFor(location: string | undefined, deviceOrigin: string): "http" | "https" | null {
  if (!location) return null;
  try {
    const target = new URL(location);
    const device = new URL(deviceOrigin);
    if (target.hostname !== device.hostname || target.port !== "" || target.protocol === device.protocol) return null;
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target.protocol === "https:" ? "https" : "http";
  } catch {
    return null;
  }
}

/**
 * Un redirect del equipo hacia EXACTAMENTE la misma petición que se acaba de
 * hacer y sin cookie nueva: seguirlo daría el mismo resultado, para siempre.
 *
 * Tres salvedades, todas patrones HTTP normales y no bucles:
 * - "302 a mí mismo + Set-Cookie": hay firmware que abre la sesión así, y ahí
 *   el segundo pedido sí cambia (el jar ya la tiene).
 * - Un POST que contesta 302 a la misma ruta (guardar y volver a mostrar): el
 *   navegador lo sigue con GET, que es otra petición. Sólo 307/308 repiten
 *   el método.
 * - Misma ruta con OTRA query (`/index.html` → `/index.html?sid=…`): cambió
 *   algo, no es bucle.
 * Lo que queda se corta con un mensaje legible en vez de dejar que el
 * navegador gire hasta rendirse con la pestaña en blanco.
 */
export function isRedirectLoop(result: EwsProxyResponse, input: Pick<RelayEwsInput, "method" | "path">, deviceOrigin: string): boolean {
  if (result.status < 300 || result.status >= 400 || result.setCookie?.length) return false;
  const repeatsSameRequest = ["GET", "HEAD"].includes(input.method.toUpperCase()) || [307, 308].includes(result.status);
  if (!repeatsSameRequest) return false;
  const location = headerValue(result.headers, "location");
  if (!location) return false;
  const target = location.startsWith("/") && !location.startsWith("//") ? location : absolutePathOf(location, deviceOrigin);
  return target !== null && target.split("#")[0] === input.path.split("#")[0];
}

/**
 * La ruta (con query) de un `Location` absoluto o protocol-relative, sólo si
 * apunta al propio equipo. Una ruta relativa (`index.sws`) devuelve null: la
 * resuelve el navegador contra la URL actual y acá no se sabe cuál es.
 */
function absolutePathOf(location: string, deviceOrigin: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(location) && !location.startsWith("//")) return null;
  try {
    const target = new URL(location, deviceOrigin);
    return target.hostname === new URL(deviceOrigin).hostname ? target.pathname + target.search : null;
  } catch {
    return null;
  }
}

/** `Referer`/`Origin` ya apuntan al equipo (los reescribió la capa HTTP); al cambiar de esquema tienen que cambiar con él. */
function withOrigin(headers: Record<string, string>, from: string, to: string): Record<string, string> {
  const out = { ...headers };
  for (const name of ["referer", "origin"]) {
    if (out[name]?.startsWith(from)) out[name] = to + out[name].slice(from.length);
  }
  return out;
}

const isHtml = (result: EwsProxyResponse) => (headerValue(result.headers, "content-type") ?? "").includes("text/html");

export interface RelayEwsInput {
  sessionId: string;
  session: EwsSession;
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64?: string;
  /** Navegaciones y escrituras se auditan; los recursos de una página (imágenes, CSS) no — serían cientos de filas por pantalla. */
  audit: boolean;
  /** IP del operador: sin esto no se puede saber quién usó una sesión abierta por otro (el ticket es un link). */
  ipAddress: string | null;
}

/**
 * Relaya UNA petición del navegador contra la EWS del equipo, por el túnel
 * sobre el WSS que el agente ya tiene abierto.
 *
 * No persiste el comando en `agent_commands` a propósito, a diferencia del
 * resto de los comandos remotos: una sola pantalla del EWS dispara decenas de
 * peticiones (cada CSS, cada imagen), y una fila por cada una inundaría la
 * cola de comandos y su historial. La trazabilidad de lo que importa —qué
 * página se abrió, qué se escribió— vive en `audit_logs`.
 */
export class RelayEwsRequestUseCase {
  constructor(
    private readonly sessions: EwsSessionStore,
    private readonly gateway: EwsProxyGateway,
    private readonly audit: AuditLogWriter
  ) {}

  execute(input: RelayEwsInput): Promise<EwsProxyResponse> {
    return throttledBySession(input.sessionId, () => this.relay(input));
  }

  private async relay(input: RelayEwsInput): Promise<EwsProxyResponse> {
    const origin = deviceOriginOf(input.session);
    const first = await this.send(input);
    const switchTo = schemeSwitchFor(headerValue(first.headers, "location"), origin);
    const result = switchTo ? await this.retryOver(input, switchTo) : first;
    // Se audita lo que el operador pidió como página Y lo que el equipo contestó como página: un `fetch` desde la consola no se escapa por mandar otro `Accept`.
    if (input.audit || isHtml(result)) await this.writeAudit(input, result.status);
    if (result.truncated) {
      throw new RemoteActionError(`La respuesta del equipo para ${input.path} supera los 2 MB que el agente relaya.`, 502);
    }
    if (isRedirectLoop(result, input, origin)) {
      throw new RemoteActionError(`El equipo redirige ${input.path} a sí mismo sin avanzar. Probá abrir la EWS de nuevo desde el portal.`, 502);
    }
    return result;
  }

  /** El equipo pidió el otro esquema: se repite el pedido por ahí, una sola vez, y sólo si anduvo se lo queda la sesión. */
  private async retryOver(input: RelayEwsInput, protocol: "http" | "https"): Promise<EwsProxyResponse> {
    const session = { ...input.session, protocol };
    const headers = withOrigin(input.headers, deviceOriginOf(input.session), deviceOriginOf(session));
    const result = await this.send({ ...input, session, headers });
    await this.sessions.update(input.sessionId, { protocol });
    return result;
  }

  private async send(input: RelayEwsInput): Promise<EwsProxyResponse> {
    const { session } = input;
    const commandId = crypto.randomUUID();
    const payload = {
      ip: session.ip, path: input.path, method: input.method,
      headers: input.headers, bodyBase64: input.bodyBase64, protocol: session.protocol,
    };
    if (!(await this.gateway.pushCommand(session.agentId, commandId, payload, "EWS_REQUEST"))) {
      if (input.audit) await this.writeAudit(input, null, "agente desconectado");
      throw new RemoteActionError("El agente no está conectado ahora mismo", 503);
    }
    return this.waitAndRemember(input, commandId);
  }

  /** Cookies del equipo y protocolo acertado se guardan en la sesión: el navegador nunca los ve, y no se re-sondea en cada recurso. */
  private async waitAndRemember(input: RelayEwsInput, commandId: string): Promise<EwsProxyResponse> {
    let result: EwsProxyResponse;
    try {
      result = await this.gateway.waitForResult(commandId, input.session.agentId, RELAY_TIMEOUT_MS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (input.audit) await this.writeAudit(input, null, message);
      throw new RemoteActionError(message, 502);
    }
    const protocol = result.protocol && result.protocol !== input.session.protocol ? result.protocol : undefined;
    const setCookie = result.setCookie?.length ? result.setCookie : undefined;
    // Las cookies se fusionan sobre lo que hay AHORA en la sesión, no sobre el snapshot de cuando llegó la petición: con 3 en vuelo, un snapshot viejo pisaba el login recién guardado.
    if (protocol || setCookie) {
      await this.sessions.update(input.sessionId, (current) => ({
        ...(protocol ? { protocol } : {}), ...(setCookie ? { cookies: mergeJar(current.cookies, setCookie) } : {}),
      }));
    }
    return result;
  }

  /** Nunca el cuerpo — ni el que va ni el que vuelve: son datos internos del cliente. Sí qué se pidió y cómo salió. La query tampoco: hay firmware que manda contraseñas por GET. */
  private writeAudit(input: RelayEwsInput, status: number | null, error?: string) {
    return this.audit.write({
      action: input.method === "GET" ? "REMOTE_EWS_ACCESS" : "REMOTE_EWS_WRITE",
      targetId: input.session.agentId, clientId: input.session.clientId,
      userId: input.session.userId || null, ipAddress: input.ipAddress,
      metadata: { device_id: input.session.deviceId, path: input.path.split("?")[0], method: input.method, status, error },
    });
  }
}
