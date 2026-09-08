import { Knex } from "knex";

/**
 * Punto único de escritura a `audit_logs` — mismo criterio que motivó
 * `deviceFilters.ts` ("la única defensa contra que el 21° call-site se olvide
 * es que el predicado/helper tenga un nombre grepeable"). Existe para que
 * ningún call-site se olvide de setear `client_id` (columna agregada por
 * `20260824020000_audit_logs_client_scope_and_indexes.ts`): sin ese valor la
 * fila queda invisible cuando el feed de auditoría filtra por cliente.
 *
 * Desde 2026-09-08 NO quedan call-sites que inserten directo: la migración se
 * cerró con los 3 últimos (`knex-device-identity-resolver.ts`,
 * `knex-user-audit-gateway.ts` y `knex-audit-log-writer.ts` de feedback), que
 * eran los que todavía escribían sin `client_id` y por eso no aparecían al
 * filtrar el feed por cliente.
 *
 * Para verificar que no reaparezca uno nuevo:
 *   grep -rn '"audit_logs")\.insert' cloud/src --include=*.ts | grep -v tests
 * El único resultado esperado es este archivo.
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
