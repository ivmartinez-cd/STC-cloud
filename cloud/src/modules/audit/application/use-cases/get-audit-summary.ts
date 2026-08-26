import type { AuditLogRepository } from "../../domain/repositories/audit-log-repository";
import { AUDIT_CATEGORY_LABELS, auditActionMeta, type AuditCategory } from "../../../../shared/domain/audit-action-catalog";
import type { ListAuditLogsInput } from "../dtos/audit-dtos";
import { toFilter } from "./list-audit-logs";

const DEVICE_UP_ACTIONS = new Set(["DEVICE_REGISTERED"]);
const DEVICE_DOWN_ACTIONS = new Set(["DEVICE_DECOMMISSIONED", "DEVICES_BULK_DECOMMISSIONED"]);
// "Cambios de configuración" del handoff hifi #3 fase 5 — ajustes globales y
// de usuarios, no altas/bajas de inventario (esas ya se cuentan aparte).
const CONFIG_ACTIONS = new Set([
  "SYSTEM_SETTINGS_UPDATED", "UPDATE_CONFIG", "USER_CREATED", "USER_UPDATED", "USER_DELETED",
]);

export interface AuditSummaryResult {
  total: number;
  perDay: number;
  byCategory: Array<{ category: AuditCategory; label: string; count: number }>;
  distinctUsers: number;
  /** El operador con más eventos en el rango — no se asume que sea "admin" por nombre. */
  topOperator: { userId: string; username: string; count: number } | null;
  deviceRegistrations: number;
  deviceDecommissions: number;
  configChanges: number;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function byCategoryFrom(byAction: Array<{ action: string; count: number }>): AuditSummaryResult["byCategory"] {
  const counts = new Map<AuditCategory, number>();
  for (const { action, count } of byAction) {
    const { category } = auditActionMeta(action);
    counts.set(category, (counts.get(category) ?? 0) + count);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, label: AUDIT_CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count);
}

function sumActions(byAction: Array<{ action: string; count: number }>, set: Set<string>): number {
  return byAction.filter((r) => set.has(r.action)).reduce((acc, r) => acc + r.count, 0);
}

function topOperatorOf(byUser: Array<{ userId: string | null; username: string | null; count: number }>): AuditSummaryResult["topOperator"] {
  const named = byUser.filter((r): r is { userId: string; username: string; count: number } => !!r.username && !!r.userId);
  if (named.length === 0) return null;
  const top = named.reduce((a, b) => (b.count > a.count ? b : a));
  return { userId: top.userId, username: top.username, count: top.count };
}

/** `GET /audit-logs/summary` — mismos filtros que `GET /audit-logs`, agregado
 * server-side. A diferencia de `/audit-logs/actions` (ventana fija de 90
 * días, global, ignora scope/filtros), esto refleja EXACTAMENTE lo que el
 * usuario está mirando. */
export class GetAuditSummaryUseCase {
  constructor(private readonly repo: AuditLogRepository) {}

  async execute(input: ListAuditLogsInput): Promise<AuditSummaryResult> {
    const filter = toFilter(input);
    const { total, byAction, byUser } = await this.repo.summarize(filter);
    const days = daysBetween(filter.fromDate, filter.toDate ?? new Date());
    return {
      total,
      perDay: Math.round(total / days),
      byCategory: byCategoryFrom(byAction),
      distinctUsers: byUser.filter((r) => r.userId).length,
      topOperator: topOperatorOf(byUser),
      deviceRegistrations: sumActions(byAction, DEVICE_UP_ACTIONS),
      deviceDecommissions: sumActions(byAction, DEVICE_DOWN_ACTIONS),
      configChanges: sumActions(byAction, CONFIG_ACTIONS),
    };
  }
}
