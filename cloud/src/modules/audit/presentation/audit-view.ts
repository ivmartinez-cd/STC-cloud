import type { AuditActionSummary } from "../domain/entities/audit-log";
import type { ListAuditLogsResult } from "../application/use-cases/list-audit-logs";
import type { AuditSummaryResult } from "../application/use-cases/get-audit-summary";

// Contrato de wire snake_case preservado tal cual lo consumía ya el portal
// (`types/audit.ts`: created_at, action_label, target_id, target_kind, etc.)
// — el dominio interno usa camelCase, esta es la traducción explícita en el
// borde del sistema.

export function toAuditLogsView(result: ListAuditLogsResult) {
  return {
    items: result.items.map((e) => ({
      id: e.id,
      created_at: e.createdAt,
      action: e.action,
      action_label: e.actionLabel,
      category: e.category,
      target_id: e.targetId,
      target_kind: e.targetKind,
      target_label: e.targetLabel,
      client_id: e.clientId,
      client_name: e.clientName,
      user_id: e.userId,
      user_username: e.userUsername,
      ip_address: e.ipAddress,
      metadata: e.metadata,
    })),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

export function toAuditActionsView(items: AuditActionSummary[]) {
  return items.map((a) => ({ action: a.action, label: a.label, category: a.category, count: a.count }));
}

export function toAuditSummaryView(s: AuditSummaryResult) {
  return {
    total: s.total,
    per_day: s.perDay,
    by_category: s.byCategory,
    distinct_users: s.distinctUsers,
    top_operator: s.topOperator ? { user_id: s.topOperator.userId, username: s.topOperator.username, count: s.topOperator.count } : null,
    device_registrations: s.deviceRegistrations,
    device_decommissions: s.deviceDecommissions,
    config_changes: s.configChanges,
  };
}
