import type { AuditActionSummary } from "../../domain/entities/audit-log";
import type { AuditLogRepository } from "../../domain/repositories/audit-log-repository";
import { auditActionMeta, listAuditActionCatalog } from "../../domain/services/audit-action-catalog";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

/**
 * Memoización simple en memoria — `GET /audit-logs/actions` agrega sobre
 * toda la tabla (potencialmente millones de filas con el tiempo); 60s de
 * cache evita que un refresco de pantalla dispare un `GROUP BY` completo en
 * cada request. El caso de uso vive una sola vez por proceso (instanciado en
 * `registerAuditRoutes` al arrancar el server, no por request), así que un
 * campo de instancia se comporta igual que la variable de módulo original.
 */
export class ListAuditActionsUseCase {
  private cache: { at: number; data: AuditActionSummary[] } | null = null;

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async execute(): Promise<AuditActionSummary[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }

    const counts = await this.auditLogRepository.countActionsSince(new Date(Date.now() - NINETY_DAYS_MS));
    const catalog = new Map(listAuditActionCatalog().map((e) => [e.action, e]));

    const data = counts
      .map(({ action, count }) => {
        const meta = catalog.get(action) ?? auditActionMeta(action);
        return { action, label: meta.label, category: meta.category, count };
      })
      .sort((a, b) => b.count - a.count);

    this.cache = { at: Date.now(), data };
    return data;
  }
}
