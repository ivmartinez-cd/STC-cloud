import { Knex } from "knex";

/**
 * Punto único de escritura a `audit_logs` — mismo criterio que motivó
 * `deviceFilters.ts` ("la única defensa contra que el 21° call-site se olvide
 * es que el predicado/helper tenga un nombre grepeable"). `audit_logs` tiene
 * ~27 call-sites hoy que insertan directo con `db("audit_logs").insert({...})`
 * sin `client_id` (columna nueva de la migración
 * `20260824020000_audit_logs_client_scope_and_indexes.ts`) — este helper es la
 * forma de que un call-site NUEVO no se olvide de setearlo.
 *
 * Migrados a este helper en esta pasada: los ~7 inserts `DEVICE_*` de
 * `deviceController.ts` y el de `deviceLifecycleService.ts` (el contenido
 * principal del feed de "Movimientos y cambios"). El resto de los ~19
 * call-sites (agentService.ts, authController.ts, clientController.ts,
 * dashboardController.ts, feedbackController.ts, portalAgentController.ts,
 * reportService.ts, deviceIdentity.ts) sigue insertando directo — quedan sin
 * `client_id` hasta una pasada de limpieza aparte (documentado como pendiente
 * en el gap analysis). No es un problema de corrección: el feed simplemente
 * no puede filtrar esas filas por cliente todavía, pero sí aparecen filtradas
 * por acción/fecha/target.
 */
export interface AuditEvent {
  action: string;
  targetId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  ip?: string | null;
  metadata?: unknown;
}

export async function writeAudit(db: Knex | Knex.Transaction, event: AuditEvent): Promise<void> {
  await db("audit_logs").insert({
    action: event.action,
    target_id: event.targetId ?? null,
    client_id: event.clientId ?? null,
    user_id: event.userId ?? null,
    ip_address: event.ip ?? null,
    metadata: event.metadata !== undefined ? JSON.stringify(event.metadata) : null,
  });
}
