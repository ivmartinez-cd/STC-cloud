import type { ClosureTotals, ReportClosure, ReportClosureLine } from "../entities/report-closure";
import type { PeriodUsageLine } from "../entities/period-usage-line";

export interface NewClosure extends ClosureTotals {
  clientId: string;
  /** Primer día del mes. */
  periodStart: Date;
  closedBy: string | null;
}

export interface ReopenClosureInput {
  reopenedBy: string | null;
  reason: string | null;
}

export interface ReportClosureRepository {
  /** El cierre `closed` vigente para (cliente, período), si existe. */
  findClosed(clientId: string, periodStart: Date): Promise<ReportClosure | null>;
  /** El cierre `reopened` de (cliente, período) que todavía no fue reemplazado. */
  findReopenedUnsuperseded(clientId: string, periodStart: Date): Promise<ReportClosure | null>;
  insertClosure(closure: NewClosure): Promise<ReportClosure>;
  /** Persiste exactamente lo que devolvió `PeriodUsageQuery` para ese cierre. */
  insertLines(closureId: string, lines: PeriodUsageLine[]): Promise<void>;
  markSuperseded(oldClosureId: string, newClosureId: string): Promise<void>;
  listByClient(clientId: string): Promise<ReportClosure[]>;
  /** Cierre por id, sólo si pertenece al cliente (ownership del `:id` de la ruta). */
  findOwned(closureId: string, clientId: string): Promise<ReportClosure | null>;
  findLines(closureId: string): Promise<ReportClosureLine[]>;
  /** Sólo estado/auditoría — NUNCA las columnas numéricas. `null` si no existe. */
  reopen(closureId: string, input: ReopenClosureInput): Promise<ReportClosure | null>;
}
