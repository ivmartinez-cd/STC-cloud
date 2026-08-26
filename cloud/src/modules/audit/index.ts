import type { Knex } from "knex";
import { KnexAuditLogRepository } from "./infrastructure/database/knex-audit-log-repository";
import type { AuditLogFilter, RawAuditLogRow } from "./domain/repositories/audit-log-repository";

export { registerAuditRoutes } from "./presentation/audit-routes";
export type { AuditLogFilter, RawAuditLogRow } from "./domain/repositories/audit-log-repository";

/** Para el informe programado "Auditoría de accesos" (`modules/scheduled-
 * reports`): sin el cap de 200 filas de `ListAuditLogsUseCase` (pensado
 * para la tabla paginada del portal, no para un export completo). */
export function findAuditLogsPage(
  db: Knex,
  filter: AuditLogFilter
): Promise<{ rows: RawAuditLogRow[]; total: number }> {
  return new KnexAuditLogRepository(db).findPage(filter);
}
