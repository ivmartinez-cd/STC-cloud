import type { PeriodUsageQuery } from "../../domain/repositories/period-usage-query";
import type { ReportClosureRepository } from "../../domain/repositories/report-closure-repository";
import type { AuditLogWriter } from "./audit-log-writer";

export interface ReportTransactionScope {
  closures: ReportClosureRepository;
  usage: PeriodUsageQuery;
  audit: AuditLogWriter;
}

/**
 * Unidad de trabajo del cierre/reapertura: header + líneas + audit en UNA
 * transacción (el cálculo de volumen también corre adentro, así el cierre
 * persiste exactamente lo que vio en ese instante).
 */
export interface ReportUnitOfWork {
  run<T>(fn: (tx: ReportTransactionScope) => Promise<T>): Promise<T>;
}
