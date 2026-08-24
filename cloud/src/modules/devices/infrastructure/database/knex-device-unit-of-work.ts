import type { Knex } from "knex";
import type { DeviceTransactionScope, DeviceUnitOfWork } from "../../application/ports/device-unit-of-work";
import { KnexAuditLogWriter } from "./knex-audit-log-writer";
import { KnexDeviceMergeRepository } from "./knex-device-merge-repository";
import { KnexDeviceRegistrationRepository } from "./knex-device-registration-repository";
import { KnexDeviceRepository } from "./knex-device-repository";

export function scopeFor(trx: Knex.Transaction): DeviceTransactionScope {
  return {
    devices: new KnexDeviceRepository(trx),
    merge: new KnexDeviceMergeRepository(trx),
    registration: new KnexDeviceRegistrationRepository(trx),
    audit: new KnexAuditLogWriter(trx),
  };
}

/** Una transacción Knex compartida por todos los repositorios del módulo + auditoría. */
export class KnexDeviceUnitOfWork implements DeviceUnitOfWork {
  constructor(private readonly db: Knex) {}

  run<T>(fn: (tx: DeviceTransactionScope) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) => fn(scopeFor(trx)));
  }
}
