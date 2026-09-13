import crypto from "crypto";

/**
 * Lo mínimo que este servicio le pide a Redis, en vez del tipo completo de
 * ioredis: así un doble de test se escribe en diez líneas y el wiring no
 * arrastra el driver por toda la cadena de tipos. Una instancia real de
 * `Redis` lo satisface estructuralmente.
 */
export interface EwsRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", duration: number): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

/**
 * Sesión del gateway de EWS remoto: el estado que hace que el navegador pueda
 * NAVEGAR la web embebida de un equipo (y no sólo pedir una página suelta como
 * `ewsProxyService.ts`).
 *
 * Vive en Redis, nunca en el navegador. La razón es la que sostiene todo el
 * diseño: **las cookies que emite la impresora se quedan del lado del
 * servidor**. El navegador del operador sólo recibe un identificador opaco de
 * sesión; el jar del equipo (la cookie de login del EWS, que es lo que le da
 * acceso administrativo al firmware) nunca sale de la nube. Así una pestaña
 * cualquiera no puede robar la sesión del EWS, y las cookies del equipo no
 * pueden pisar las del portal.
 *
 * Expira por tiempo, igual que el Remote EWS de HP ("requests and session
 * expire", Security White Paper pág. 7): una sesión olvidada abierta contra la
 * LAN de un cliente es exactamente lo que no queremos.
 */

/** Ventana deslizante: se renueva con cada request del operador, no desde que se abrió. */
const SESSION_TTL_SECONDS = 30 * 60;
/**
 * Tope ABSOLUTO desde que se abrió, además de la ventana deslizante. Sin
 * esto, una página de estado que se auto-refresca (el SyncThru lo hace)
 * mantiene el túnel a la LAN del cliente vivo para siempre. 8 h cubre una
 * jornada entera de trabajo sobre el mismo equipo.
 */
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** El ticket cruza de un origen al otro por la URL — vida corta y un solo uso, igual que `wsTicketService`. */
const TICKET_TTL_SECONDS = 60;

export interface EwsSession {
  userId: string;
  role: string;
  agentId: string;
  deviceId: string;
  clientId: string | null;
  /** IP resuelta desde `devices` al abrir la sesión. NUNCA se re-lee de la request del navegador. */
  ip: string;
  /** Para mostrar en la barra del gateway: modelo/serie del equipo. */
  label: string;
  /** Lo fija la primera respuesta del agente (sondea HTTP y cae a HTTPS), o un 302 del equipo al otro esquema; así no se re-sondea en cada recurso. */
  protocol?: "http" | "https";
  /** Jar de cookies DEL EQUIPO, serializado como header `Cookie`. */
  cookies: string;
  createdAt: string;
}

const sessionKey = (id: string) => `ews-session:${id}`;
const ticketKey = (ticket: string) => `ews-ticket:${ticket}`;
/**
 * Índice de sesiones por monitor, para poder cerrarlas todas cuando se
 * deshabilita el permiso o cuando un operador lo pide desde el portal. Vive
 * lo mismo que la sesión más larga posible; puede quedar con ids de sesiones
 * ya vencidas, y `destroy` los tolera.
 */
const agentIndexKey = (agentId: string) => `ews-sessions:agent:${agentId}`;

export async function createEwsSession(redis: EwsRedisClient, data: Omit<EwsSession, "cookies" | "createdAt">): Promise<string> {
  const id = crypto.randomBytes(32).toString("hex");
  const session: EwsSession = { ...data, cookies: "", createdAt: new Date().toISOString() };
  await redis.set(sessionKey(id), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  await redis.sadd(agentIndexKey(data.agentId), id);
  await redis.expire(agentIndexKey(data.agentId), SESSION_MAX_AGE_MS / 1000);
  return id;
}

/** Ticket de un solo uso para cruzar del origen del portal al del gateway (dominios distintos = cookies distintas). */
export async function mintEwsTicket(redis: EwsRedisClient, sessionId: string): Promise<string> {
  const ticket = crypto.randomBytes(32).toString("hex");
  await redis.set(ticketKey(ticket), sessionId, "EX", TICKET_TTL_SECONDS);
  return ticket;
}

/** GETDEL: un ticket reenviado (historial, log de proxy) ya no sirve la segunda vez. */
export async function consumeEwsTicket(redis: EwsRedisClient, ticket: string): Promise<string | null> {
  return redis.getdel(ticketKey(ticket));
}

/** Leer renueva el TTL: la sesión muere por inactividad, no a los 30 minutos de haberla abierto — pero nunca pasa del tope absoluto. */
export async function readEwsSession(redis: EwsRedisClient, id: string): Promise<EwsSession | null> {
  const raw = await redis.get(sessionKey(id));
  if (!raw) return null;
  const session = parseSession(raw);
  if (!session) return null;
  if (Date.now() - Date.parse(session.createdAt) > SESSION_MAX_AGE_MS) {
    await redis.del(sessionKey(id));
    return null;
  }
  await redis.expire(sessionKey(id), SESSION_TTL_SECONDS);
  return session;
}

function parseSession(raw: string): EwsSession | null {
  try {
    return JSON.parse(raw) as EwsSession;
  } catch {
    return null;
  }
}

/** Un cambio a aplicar sobre la sesión: fijo, o calculado sobre lo que hay AHORA en Redis (para fusionar cookies sin pisar). */
export type EwsSessionPatch = Partial<EwsSession> | ((current: EwsSession) => Partial<EwsSession>);

/**
 * Los updates de una misma sesión se encadenan en este proceso, así dos
 * respuestas del equipo que llegan a la vez no se pisan el jar: cada una
 * calcula su cambio sobre lo que la anterior acaba de escribir. Entre
 * réplicas distintas la garantía no existe (sería un script Lua o WATCH);
 * una sesión rara vez reparte sus pedidos entre dos réplicas, y el costo de
 * perder una cookie es volver a loguearse en el equipo, no un agujero.
 */
const updateChains = new Map<string, Promise<void>>();

export function updateEwsSession(redis: EwsRedisClient, id: string, patch: EwsSessionPatch): Promise<void> {
  const previous = updateChains.get(id) ?? Promise.resolve();
  const next = previous.then(() => applyPatch(redis, id, patch)).catch(() => undefined);
  updateChains.set(id, next);
  return next.finally(() => { if (updateChains.get(id) === next) updateChains.delete(id); });
}

async function applyPatch(redis: EwsRedisClient, id: string, patch: EwsSessionPatch): Promise<void> {
  const current = await readEwsSession(redis, id);
  if (!current) return;
  const changes = typeof patch === "function" ? patch(current) : patch;
  await redis.set(sessionKey(id), JSON.stringify({ ...current, ...changes }), "EX", SESSION_TTL_SECONDS);
}

export async function destroyEwsSession(redis: EwsRedisClient, id: string): Promise<void> {
  const raw = await redis.get(sessionKey(id));
  const session = raw ? parseSession(raw) : null;
  await redis.del(sessionKey(id));
  if (session) await redis.srem(agentIndexKey(session.agentId), id);
}

/** Cierra TODAS las sesiones abiertas contra los equipos de un monitor; devuelve cuántas estaban vivas. */
export async function destroyEwsSessionsForAgent(redis: EwsRedisClient, agentId: string): Promise<number> {
  const ids = await redis.smembers(agentIndexKey(agentId));
  let closed = 0;
  for (const id of ids) closed += await redis.del(sessionKey(id));
  await redis.del(agentIndexKey(agentId));
  return closed;
}

/**
 * Fusiona los `Set-Cookie` del equipo sobre el jar de la sesión y devuelve el
 * header `Cookie` para la próxima petición.
 *
 * Deliberadamente simple: se guarda `nombre=valor` y se descartan los
 * atributos (`Path`, `Domain`, `Expires`, `Secure`…). Acá hay un único
 * destinatario —una impresora, una sesión, un operador— así que no hay nada
 * que aislar por path ni por dominio, y respetar `Secure`/`Domain` sólo podría
 * hacer que se pierda la cookie de login. Un `Max-Age=0`/`Expires` en el
 * pasado sí se respeta: es como el firmware cierra la sesión.
 */
export function mergeCookieJar(previous: string, setCookie: string[]): string {
  const jar = new Map<string, string>();
  for (const pair of previous.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name) jar.set(name, rest.join("="));
  }
  for (const cookie of setCookie) {
    const [pair, ...attrs] = cookie.split(";");
    const [name, ...rest] = pair.trim().split("=");
    if (!name) continue;
    if (isExpired(attrs)) jar.delete(name);
    else jar.set(name, rest.join("="));
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function isExpired(attributes: string[]): boolean {
  for (const attr of attributes) {
    const [key, value] = attr.split("=").map((s) => s.trim().toLowerCase());
    if (key === "max-age" && Number(value) <= 0) return true;
    if (key === "expires" && value && Date.parse(value) <= Date.now()) return true;
  }
  return false;
}
