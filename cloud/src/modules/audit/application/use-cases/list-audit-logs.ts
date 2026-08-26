import type { AuditLogEntry } from "../../domain/entities/audit-log";
import type { AuditLogFilter, AuditLogRepository } from "../../domain/repositories/audit-log-repository";
import { auditActionMeta, listAuditActionCatalog } from "../../../../shared/domain/audit-action-catalog";
import type { ListAuditLogsInput } from "../dtos/audit-dtos";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function resolveActionsFilter(action: string | undefined): string[] | undefined {
  if (!action) return undefined;
  const actions = action.split(",").map((v) => v.trim()).filter(Boolean);
  return actions.length ? actions : undefined;
}

function resolveCategoryActionsFilter(category: string | undefined): string[] | undefined {
  if (!category) return undefined;
  const categories = new Set(category.split(",").map((v) => v.trim()).filter(Boolean));
  const matching = listAuditActionCatalog()
    .filter((e) => categories.has(e.category))
    .map((e) => e.action);
  // Categoría sin ninguna acción conocida → filtro que no matchea nada
  // (en vez de devolver todo sin filtrar).
  return matching.length ? matching : ["__none__"];
}

export function toFilter(input: ListAuditLogsInput): AuditLogFilter {
  return {
    fromDate: input.from ? new Date(input.from) : new Date(Date.now() - THIRTY_DAYS_MS),
    toDate: input.to ? new Date(input.to) : undefined,
    actionsFilter: resolveActionsFilter(input.action),
    categoryActionsFilter: resolveCategoryActionsFilter(input.category),
    clientId: input.clientId,
    targetId: input.targetId,
    userId: input.userId,
    excludeUserId: input.excludeUserId,
    limit: Math.min(Number(input.limit) || 50, 200),
    offset: Math.max(Number(input.offset) || 0, 0),
  };
}

export interface ListAuditLogsResult {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export class ListAuditLogsUseCase {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async execute(input: ListAuditLogsInput): Promise<ListAuditLogsResult> {
    const filter = toFilter(input);
    const { rows, total } = await this.auditLogRepository.findPage(filter);

    const items: AuditLogEntry[] = rows.map((r) => {
      const meta = auditActionMeta(r.action);
      return {
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        actionLabel: meta.label,
        category: meta.category,
        targetId: r.targetId,
        targetKind: r.targetKind,
        targetLabel: r.targetLabel,
        clientId: r.clientId,
        clientName: r.clientName,
        userId: r.userId,
        userUsername: r.userUsername,
        ipAddress: r.ipAddress,
        metadata: r.metadata,
      };
    });

    return { items, total, limit: filter.limit, offset: filter.offset };
  }
}
