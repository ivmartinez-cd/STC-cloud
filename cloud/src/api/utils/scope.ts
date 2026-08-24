import { FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { AGENT_ID_URL_PREFIX, CLIENT_ID_URL_PREFIX, DEVICE_ID_URL_PREFIX, INCIDENT_ID_URL_PREFIX, SUPPLY_REQUEST_ID_URL_PREFIX } from "../policy/rolePolicy";

/**
 * Alcance de datos resuelto para la request actual. Unión discriminada a propósito —
 * NO `string | null` — porque un `null` que significa a la vez "admin sin restricción"
 * y "viewer sin cliente" es un `if` invertido de distancia de una fuga entre clientes.
 * El scope se deriva siempre del ROL (ver `rolePolicy.ts`), nunca de si el usuario
 * "tiene o no" client_id: eso evita que un admin con un client_id residual quede
 * restringido, y que un client_viewer con client_id nulo (estado que el middleware ya
 * bloquea con 403 antes de llegar acá) sea tratado alguna vez como "todo permitido".
 */
export type Scope = { kind: "all" } | { kind: "client"; id: string };

/**
 * Construye la clave de ruta usada por la allowlist de roles: `${método} ${url
 * declarada}`. Usa `request.routeOptions.url`, que es la ruta ya matcheada por Fastify
 * ("/api/v1/clients/:id"), NUNCA `request.url` — esa es la URL cruda tal como la mandó
 * el cliente y es trivial de falsear (`..%2f`, slash final, query string). HEAD se
 * normaliza a GET: Fastify auto-registra un HEAD para cada ruta GET con el mismo
 * preHandler, y la allowlist sólo lista los GET.
 */
export function getRouteKey(request: FastifyRequest): string {
  const method = request.method === "HEAD" ? "GET" : request.method;
  return `${method} ${request.routeOptions.url ?? ""}`;
}

/** Lee `request.user` ya inyectado por `portalAuth` (sólo debe llamarse después de él). */
export function getPortalUser(request: FastifyRequest): PortalUser {
  return (request as FastifyRequest & { user: PortalUser }).user;
}

/** Deriva el `Scope` de la request a partir del rol ya resuelto por `portalAuth`. */
export function getScope(request: FastifyRequest): Scope {
  const user = getPortalUser(request);
  if (user.role === "client_viewer") {
    // portalAuth ya devolvió 403 si clientId es null antes de que el handler corra;
    // este `as string` documenta esa garantía en vez de repetir el chequeo.
    return { kind: "client", id: user.clientId as string };
  }
  return { kind: "all" };
}

/**
 * Subconsulta con los `id` de los agentes del cliente `cid`. Se usa como
 * `whereIn("devices.agent_id", agentIdsOf(db, cid))` en vez de agregar un
 * `.join("agents", ...)` a una query existente: `devices`, `agents` y `clients`
 * comparten columnas (`id`, `name`, `created_at`, `last_seen`) y un join nuevo sobre una
 * query que ya las selecciona sin calificar rompe con "column reference is ambiguous"
 * o, peor, cambia en silencio la forma de la respuesta.
 *
 * Devuelve un builder NUEVO en cada llamada — no reusar una instancia entre queries que
 * corren en paralelo (`Promise.all`), Knex los builders son mutables.
 */
export function agentIdsOf(db: Knex, clientId: string): Knex.QueryBuilder {
  return db("agents").where("client_id", clientId).select("id");
}

/**
 * Subconsulta de OWNERSHIP (no de inventario) con los `id` de los equipos del
 * cliente `cid`. Usa `devices.client_id` directo desde la identidad por
 * cliente (§2.4) — un salto en vez de dos. Deliberadamente NO excluye bajas ni
 * fusiones: angostarla mezclaría "de quién es este equipo" (RBAC) con "está
 * vivo en el inventario" (deviceFilters.ts), y haría que un cambio de ciclo de
 * vida altere en silencio el scoping de autorización. Quien necesite excluir
 * bajas/fusiones lo hace explícitamente con `onlyLiveDevices`/`notMerged`.
 */
export function deviceIdsOf(db: Knex, clientId: string): Knex.QueryBuilder {
  return db("devices").where("client_id", clientId).select("id");
}

/**
 * Ownership central para rutas `/clients/:id*`: comparación de strings, cero queries.
 * Se llama sólo cuando `scope.kind === "client"` (admin/operator no tienen `:id` propio
 * que validar). `true` = el `:id` de la URL es el cliente del usuario.
 */
export function clientIdParamMatchesScope(request: FastifyRequest, scope: Scope): boolean {
  if (scope.kind !== "client") return true;
  const { id } = request.params as { id?: string };
  return id === scope.id;
}

/**
 * Ownership central para rutas `/agents/:id*`: un lookup contra `agents_client_id_idx`.
 * `null` (agente inexistente o `client_id` nulo — agente huérfano) o distinto cliente
 * → el llamador debe responder 404 (no 403: evita un oráculo de existencia sobre UUIDs
 * ajenos).
 */
export async function agentIdParamMatchesScope(
  db: Knex,
  request: FastifyRequest,
  scope: Scope
): Promise<boolean> {
  if (scope.kind !== "client") return true;
  const { id } = request.params as { id?: string };
  if (!id) return false;
  const agent = await db("agents").where({ id }).select("client_id").first();
  return !!agent && agent.client_id === scope.id;
}

const DEVICE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ownership central para rutas `/devices/:id*`: un lookup contra
 * `devices_client_id_idx`. `null` (no existe o `client_id` nulo) o distinto
 * cliente → el llamador responde 404, no 403 (mismo criterio que
 * `agentIdParamMatchesScope`: evita un oráculo de existencia sobre UUIDs
 * ajenos). Antes de esta pasada NINGÚN handler de `/devices/:id*` llamaba a
 * `getScope` (ver `deleteDevice`) — este chequeo central cierra ese hueco
 * para toda subruta presente y futura, sin depender de que cada handler se
 * acuerde.
 *
 * El `:id` de `/devices/:id*` NO es siempre un UUID: `deviceController`
 * también resuelve por prefijo de id, serial o IP (ver `getDevice`,
 * `getDeviceReadings`) — un `WHERE id = ?` a secas con un serial como
 * `"SN-1234"` revienta con `invalid input syntax for type uuid` (22P02) ANTES
 * de llegar al handler, que es exactamente el bug que ese mismo alias-lookup
 * ya arregló una vez en `getDeviceReadings`. Este chequeo replica la misma
 * resolución para no reintroducirlo un nivel más arriba.
 */
export async function deviceIdParamMatchesScope(
  db: Knex,
  request: FastifyRequest,
  scope: Scope
): Promise<boolean> {
  if (scope.kind !== "client") return true;
  const { id } = request.params as { id?: string };
  if (!id) return false;
  const isUuid = DEVICE_UUID_RE.test(id);
  const device = await db("devices")
    .where((b) => {
      if (isUuid) {
        b.where("id", id);
      } else {
        b.whereRaw("id::text LIKE ?", [`${id}%`]).orWhere("serial_number", id).orWhereRaw("ip_address::text = ?", [id]);
      }
    })
    .select("client_id")
    .first();
  return !!device && device.client_id === scope.id;
}

/**
 * Ownership central para rutas `/incidents/:id*` (Fase 11 del gap analysis vs
 * HP SDS) — mismo criterio que `deviceIdParamMatchesScope`: 404, no 403, para
 * no dar un oráculo de existencia sobre UUIDs ajenos. A diferencia de
 * dispositivos, acá el `:id` siempre es un UUID (sin alias por serial/IP).
 */
export async function incidentIdParamMatchesScope(
  db: Knex,
  request: FastifyRequest,
  scope: Scope
): Promise<boolean> {
  if (scope.kind !== "client") return true;
  const { id } = request.params as { id?: string };
  if (!id) return false;
  const incident = await db("incidents").where({ id }).select("client_id").first();
  return !!incident && incident.client_id === scope.id;
}

/** `true` si la URL declarada de la ruta es una subruta de `/clients/:id`, `/agents/:id` o `/devices/:id`. */
export function isClientIdParamRoute(routeUrl: string): boolean {
  return routeUrl.startsWith(CLIENT_ID_URL_PREFIX);
}
export function isAgentIdParamRoute(routeUrl: string): boolean {
  return routeUrl.startsWith(AGENT_ID_URL_PREFIX);
}
export function isDeviceIdParamRoute(routeUrl: string): boolean {
  return routeUrl.startsWith(DEVICE_ID_URL_PREFIX);
}
export function isIncidentIdParamRoute(routeUrl: string): boolean {
  return routeUrl.startsWith(INCIDENT_ID_URL_PREFIX);
}
export function isSupplyRequestIdParamRoute(routeUrl: string): boolean {
  return routeUrl.startsWith(SUPPLY_REQUEST_ID_URL_PREFIX);
}

/** Mismo patrón 404-no-403 que `incidentIdParamMatchesScope` (el `:id` es siempre UUID). */
export async function supplyRequestIdParamMatchesScope(
  db: Knex,
  request: FastifyRequest,
  scope: Scope
): Promise<boolean> {
  if (scope.kind !== "client") return true;
  const { id } = request.params as { id?: string };
  if (!id) return false;
  const row = await db("supply_requests").where({ id }).select("client_id").first();
  return !!row && row.client_id === scope.id;
}
