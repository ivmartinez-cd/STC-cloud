import type { Knex } from "knex";
import type { AlertTransactionScope, AlertUnitOfWork } from "../../application/ports/alert-unit-of-work";
import { KnexAlertRepository } from "./knex-alert-repository";
import { KnexAuditLogWriter } from "./knex-audit-log-writer";

/** Una transacción Knex compartida por el repositorio de alertas y el writer de auditoría. */
export class KnexAlertUnitOfWork implements AlertUnitOfWork {
  constructor(private readonly db: Knex) {}

  run<T>(fn: (tx: AlertTransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) =>
      fn({ alerts: new KnexAlertRepository(trx), audit: new KnexAuditLogWriter(trx) })
    );
  }
}
