import type { DeviceMergeRepository } from "../../domain/repositories/device-merge-repository";
import type { DeviceRegistrationRepository } from "../../domain/repositories/device-registration-repository";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import type { AuditLogWriter } from "./audit-log-writer";

export interface DeviceTransactionScope {
  devices: DeviceRepository;
  merge: DeviceMergeRepository;
  registration: DeviceRegistrationRepository;
  audit: AuditLogWriter;
}

/** Sentinela para abortar una transacción a propósito (dry-run de la fusión). */
export class RollbackSignal extends Error {
  readonly __rollback = true;
}

export interface DeviceUnitOfWork {
  run<T>(fn: (tx: DeviceTransactionScope) => Promise<T>): Promise<T>;
}
