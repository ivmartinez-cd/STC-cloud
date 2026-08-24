import type { Knex } from "knex";
import type { ReportTransactionScope, ReportUnitOfWork } from "../../application/ports/report-unit-of-work";
import { KnexAuditLogWriter } from "./knex-audit-log-writer";
import { KnexPeriodUsageQuery } from "./knex-period-usage-query";
import { KnexReportClosureRepository } from "./knex-report-closure-repository";

/** Una transacción Knex compartida por repositorio, consulta de volumen y writer de auditoría. */
export class KnexReportUnitOfWork implements ReportUnitOfWork {
  constructor(private readonly db: Knex) {}

  run<T>(fn: (tx: ReportTransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) =>
      fn({
        closures: new KnexReportClosureRepository(trx),
        usage: new KnexPeriodUsageQuery(trx),
        audit: new KnexAuditLogWriter(trx),
      })
    );
  }
}
