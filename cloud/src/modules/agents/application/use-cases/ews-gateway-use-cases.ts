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
 * mirando equipos distintos no se estorban.
 */
const MAX_CONCURRENT_PER_SESSION = 3;

/**
 * Carriles por sesión: cada petición se encola en uno y espera a la anterior de
 * ESE carril, así nunca hay más de `MAX_CONCURRENT_PER_SESSION` en vuelo.
 *
 * Vive en memoria del proceso (como los resolvers de `ewsProxyService`): si dos
 * réplicas atienden la misma sesión, cada una limita su propia parte, que es
 * suficiente. El mapa crece con las sesiones abiertas en la vida del proceso —
 * unas pocas entradas de 3 promesas cada una, nada que haga falta purgar.
 */
const lanesBySession = new Map<string, { lanes: Promise<unknown>[]; next: number }>();

function throttledBySession<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  const entry = lanesBySession.get(sessionId)
    ?? { lanes: Array.from({ length: MAX_CONCURRENT_PER_SESSION }, () => Promise.resolve() as Promise<unknown>), next: 0 };
  lanesBySession.set(sessionId, entry);
  const lane = entry.next;
  entry.next = (lane + 1) % MAX_CONCURRENT_PER_SESSION;
  const result = entry.lanes[lane].then(run, run);
  // El carril sigue vivo aunque esta petición falle: un 502 no puede trabar el resto de la página.
  entry.lanes[lane] = result.catch(() => undefined);
  return result;
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

/** Los headers del equipo llegan con la capitalización que se le ocurra al firmware. */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name);
  return found ? headers[found] : undefined;
}

/**
 * Detecta que el equipo redirige a SÍ MISMO pero por el otro esquema —el
 * clásico "esto se habla por HTTPS" de un firmware con TLS obligatorio.
 *
 * Hay que verlo acá y no dejarlo pasar, porque el `Location` absoluto se
 * convierte en ruta relativa antes de llegar al navegador (si no, el navegador
 * saldría hacia la IP de la LAN del cliente). Esa reescritura se come el
 * cambio de esquema: el navegador vuelve a pedir la misma ruta, el gateway
 * vuelve a hablarle al equipo por el protocolo viejo, y el equipo vuelve a
 * redirigir. **Bucle infinito**, que Chrome corta con la pestaña en blanco.
 *
 * Verificado el 13/09/2026 contra el SyncThru de ISSN: 30 pedidos a `/` en 17
 * segundos, todos 302, y ni un solo recurso de la página.
 *
 * Con esto la sesión aprende el protocolo bueno —igual que ya aprende el jar
 * de cookies— y el reintento es invisible para el operador.
 */
export function schemeSwitchFor(location: string | undefined, deviceOrigin: string): "http" | "https" | null {
  if (!location) return null;
  try {
    const target = new URL(location);
    const device = new URL(deviceOrigin);
    if (target.hostname !== device.hostname || target.protocol === device.protocol) return null;
    return target.protocol === "https:" ? "https" : "http";
  } catch {
    return null;
  }
}

/**
 * Un redirect del equipo hacia la MISMA ruta que se acaba de pedir y sin
 * cookie nueva: seguirlo daría exactamente el mismo resultado, para siempre.
 *
 * La salvedad de la cookie no es un detalle: "302 a mí mismo + Set-Cookie" es
 * como muchos firmwares abren la sesión, y ahí el segundo pedido sí cambia
 * (el jar de la sesión ya la tiene). Sin cookie nueva no hay nada que pueda
 * cambiar, y se corta con un mensaje legible en vez de dejar que el navegador
 * gire hasta rendirse con la pestaña en blanco.
 */
function isRedirectLoop(result: EwsProxyResponse, requestPath: string, deviceOrigin: string): boolean {
  if (result.status < 300 || result.status >= 400 || result.setCookie?.length) return false;
  const location = headerValue(result.headers, "location");
  if (!location) return false;
  const target = location.startsWith("/") ? location : safePathOf(location, deviceOrigin);
  return target !== null && target.split("?")[0] === requestPath.split("?")[0];
}

/** La ruta de un `Location` absoluto, sólo si apunta al propio equipo. */
function safePathOf(location: string, deviceOrigin: string): string | null {
  try {
    const target = new URL(location);
    return target.hostname === new URL(deviceOrigin).hostname ? target.pathname + target.search : null;
  } catch {
    return null;
  }
}

export interface RelayEwsInput {
  sessionId: string;
  session: EwsSession;
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64?: string;
  /** Navegaciones y escrituras se auditan; los recursos de una página (imágenes, CSS) no — serían cientos de filas por pantalla. */
  audit: boolean;
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
    const first = await this.send(input);
    const switchTo = schemeSwitchFor(headerValue(first.headers, "location"), deviceOriginOf(input.session));
    const result = switchTo ? await this.retryOver(input, switchTo) : first;
    if (input.audit) await this.writeAudit(input, result.status);
    if (isRedirectLoop(result, input.path, deviceOriginOf(input.session))) {
      throw new RemoteActionError(`El equipo redirige ${input.path} a sí mismo sin avanzar. Probá abrir la EWS de nuevo desde el portal.`, 502);
    }
    return result;
  }

  /** El equipo pidió el otro esquema: se lo guarda la sesión y se repite el pedido, una sola vez. */
  private async retryOver(input: RelayEwsInput, protocol: "http" | "https"): Promise<EwsProxyResponse> {
    await this.sessions.update(input.sessionId, { protocol });
    return this.send({ ...input, session: { ...input.session, protocol } });
  }

  private async send(input: RelayEwsInput): Promise<EwsProxyResponse> {
    const { session } = input;
    const commandId = crypto.randomUUID();
    const payload = {
      ip: session.ip, path: input.path, method: input.method,
      headers: input.headers, bodyBase64: input.bodyBase64, protocol: session.protocol,
    };
    if (!(await this.gateway.pushCommand(session.agentId, commandId, payload, "EWS_REQUEST"))) {
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
    const patch: Partial<EwsSession> = {};
    if (result.protocol && result.protocol !== input.session.protocol) patch.protocol = result.protocol;
    if (result.setCookie?.length) patch.cookies = mergeJar(input.session.cookies, result.setCookie);
    if (Object.keys(patch).length) await this.sessions.update(input.sessionId, patch);
    return result;
  }

  /** Nunca el cuerpo — ni el que va ni el que vuelve: son datos internos del cliente. Sí qué se pidió y cómo salió. */
  private writeAudit(input: RelayEwsInput, status: number | null, error?: string) {
    return this.audit.write({
      action: input.method === "GET" ? "REMOTE_EWS_ACCESS" : "REMOTE_EWS_WRITE",
      targetId: input.session.agentId, clientId: input.session.clientId,
      userId: input.session.userId || null, ipAddress: null,
      metadata: { device_id: input.session.deviceId, path: input.path, method: input.method, status, error },
    });
  }
}
