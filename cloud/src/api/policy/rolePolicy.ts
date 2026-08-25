/**
 * Registro explícito de qué puede hacer cada rol del portal. No depende de Knex ni de
 * Fastify (datos + funciones puras) para poder testearse sin base ni servidor.
 *
 * Deny-by-default en dos ejes:
 *  - Rol: `policyFor()` devuelve `null` para cualquier string que no esté en `POLICIES`
 *    (typo, mayúscula distinta, espacio de más). El middleware trata `null` como 403 —
 *    nunca como "sin restricción". Con la CHECK de la migración esto no debería ocurrir
 *    en producción, pero el código no confía en la base para su propia seguridad.
 *  - Ruta: un rol `scoped` sólo puede llamar las rutas de `routes`. Ruta no listada → 403.
 *    admin/operator son `scoped:false` y no se filtran por lista (comportamiento actual,
 *    sin cambios).
 *
 * La clave de ruta es `${método} ${routeOptions.url}` — la ruta DECLARADA (p.ej.
 * "/api/v1/clients/:id"), no la URL cruda de la request. Ver `getRouteKey()` en
 * `../utils/scope.ts` para por qué eso importa.
 */
export type Role = "admin" | "operator" | "client_viewer";

/**
 * Discriminada por `scoped` a propósito: así `policy.routes` se angosta a
 * `ReadonlySet<string>` dentro de `if (policy.scoped)` sin cast, y es imposible
 * construir un rol `scoped:true` sin su allowlist de rutas.
 */
export type RolePolicy =
  | { scoped: false; routes: "all" }
  | { scoped: true; routes: ReadonlySet<string> };

/**
 * Rutas permitidas para `client_viewer`. Lectura scopeada por cliente + la única
 * mutación que no requiere privilegio (reportar un bug). Todo lo demás — gestión de
 * agentes/clientes, comandos remotos, usuarios, config/logs de agente (ver nota abajo) —
 * queda fuera a propósito.
 *
 * `/agents/:id/config` y `/agents/:id/logs*` NO están acá aunque son lecturas:
 * `config` expone `snmp_community` (credencial SNMP de toda la LAN del cliente) e
 * `ip_ranges`; `logs` es texto libre emitido por el agente sin schema que acote su
 * contenido futuro. Ninguno es necesario para un rol de sólo lectura.
 */
export const CLIENT_VIEWER_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/v1/portal/me",
  "GET /api/v1/dashboard",
  "GET /api/v1/alerts",
  "GET /api/v1/alerts/classes",
  "GET /api/v1/alerts/summary",
  "GET /api/v1/search",
  "GET /api/v1/clients",
  "GET /api/v1/clients/summary",
  "GET /api/v1/clients/directory",
  "GET /api/v1/clients/:id",
  "GET /api/v1/clients/:id/monitors",
  "GET /api/v1/clients/:id/usage",
  "GET /api/v1/clients/:id/devices",
  "GET /api/v1/clients/:id/stats",
  "GET /api/v1/clients/:id/devices/directory",
  "GET /api/v1/clients/:id/custom-fields",
  "GET /api/v1/device-models",
  "GET /api/v1/clients/:id/reports/preview",
  "GET /api/v1/clients/:id/reports",
  "GET /api/v1/clients/:id/reports/:closureId",
  "GET /api/v1/clients/:id/reports/:closureId/export.csv",
  "GET /api/v1/clients/:id/reports/:closureId/export.xlsx",
  "GET /api/v1/agents",
  "GET /api/v1/agents/:id",
  "GET /api/v1/agents/:id/devices",
  "GET /api/v1/devices",
  "GET /api/v1/devices/:id",
  "GET /api/v1/devices/:id/readings",
  "GET /api/v1/devices/:id/usage-history",
  "GET /api/v1/devices/:id/supplies",
  "GET /api/v1/supplies",
  "GET /api/v1/supplies/summary",
  // Fase 11 del gap analysis vs HP SDS — sólo lectura, scopeada. Crear/editar/
  // cerrar/reabrir/comentar/asignar/vincular alertas y las reglas de
  // auto-creación quedan deny-by-default (gestión de servicio, no de un
  // client_viewer).
  "GET /api/v1/incidents",
  // 2FA self-service: proteger la propia cuenta es de todos los roles.
  "GET /api/v1/portal/2fa/status",
  "POST /api/v1/portal/2fa/setup",
  "POST /api/v1/portal/2fa/enable",
  "POST /api/v1/portal/2fa/disable",
  "POST /api/v1/portal/2fa/recovery-codes",
  "GET /api/v1/supply-requests",
  "GET /api/v1/supply-requests/stats",
  "GET /api/v1/supply-requests/:id",
  "GET /api/v1/incidents/stats",
  "GET /api/v1/incidents/:id",
  "POST /api/v1/feedback",
]);

const POLICIES: Record<Role, RolePolicy> = {
  admin: { scoped: false, routes: "all" },
  operator: { scoped: false, routes: "all" },
  client_viewer: { scoped: true, routes: CLIENT_VIEWER_ROUTES },
};

/** Devuelve la política del rol, o `null` si el rol no está registrado (deny-by-default). */
export function policyFor(role: string): RolePolicy | null {
  return Object.prototype.hasOwnProperty.call(POLICIES, role) ? POLICIES[role as Role] : null;
}

/**
 * Prefijos de URL declarada (no de método) cuyo `:id` se valida centralmente contra el
 * cliente del usuario, cuando el scope es "client". Cubren TODAS las subrutas de cada
 * recurso (p.ej. "/api/v1/agents/:id/revoke", "/api/v1/agents/:id/config" también
 * matchean AGENT_ID_URL_PREFIX) — el chequeo de propiedad es el mismo sin importar el
 * método o la subruta; la allowlist de `CLIENT_VIEWER_ROUTES` ya decide por separado si
 * ese método/subruta puntual está permitido para el rol.
 */
export const CLIENT_ID_URL_PREFIX = "/api/v1/clients/:id";
export const AGENT_ID_URL_PREFIX = "/api/v1/agents/:id";
export const DEVICE_ID_URL_PREFIX = "/api/v1/devices/:id";
export const INCIDENT_ID_URL_PREFIX = "/api/v1/incidents/:id";
export const SUPPLY_REQUEST_ID_URL_PREFIX = "/api/v1/supply-requests/:id";
