import type { Knex } from "knex";
import type { RenderedTable } from "../../application/ports/report-renderer";
import { findAuditLogsPage, type RawAuditLogRow } from "../../../audit";
import { auditActionMeta, listAuditActionCatalog, type AuditCategory } from "../../../../shared/domain/audit-action-catalog";

const MAX_ROWS = 5000;
const COLUMNS = ["Fecha", "Acción", "Usuario", "Cliente", "Objetivo", "IP"];

function fmtDate(d: Date | string): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16);
}

function rowOf(r: RawAuditLogRow): (string | number | null)[] {
  return [fmtDate(r.createdAt), auditActionMeta(r.action).label, r.userUsername, r.clientName, r.targetLabel, r.ipAddress];
}

function actionsForCategory(category: AuditCategory): string[] {
  return listAuditActionCatalog().filter((e) => e.category === category).map((e) => e.action);
}

/** "Auditoría de accesos" programado — cierre de gap post-verificación del
 * handoff hifi #3 (26/08/2026): igual que `billing-closure-table.ts`, el
 * mockup de Informes mostraba esta plantilla sin `ReportType` real detrás.
 * Categoría `security` (login OK/fallido, 2FA) — es la lectura literal de
 * "accesos"; auditoría de OTRAS acciones (cambios de config, etc.) ya la
 * cubre el módulo Movimientos, no esta plantilla. Ventana de días como
 * `alert_history` (mismo patrón), sin el cap de 200 filas del portal. */
export async function auditExportTable(
  db: Knex,
  params: { title: string; clientId: string | null; days: number }
): Promise<RenderedTable> {
  const fromDate = new Date(Date.now() - params.days * 24 * 3600 * 1000);
  const { rows, total } = await findAuditLogsPage(db, {
    fromDate, clientId: params.clientId ?? undefined,
    categoryActionsFilter: actionsForCategory("security"),
    limit: MAX_ROWS, offset: 0,
  });
  return { title: params.title, columns: COLUMNS, rows: rows.map(rowOf), truncated: Math.max(0, total - rows.length) };
}
