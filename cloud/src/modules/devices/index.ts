import type { Knex } from "knex";
import type { DeviceRow, MergeParams, MergeResult, PendingDeviceRow } from "./domain/entities/device";
import type { ListPendingInput, RegistrationActionInput, SetMonitorStateInput, UnignoreInput } from "./application/dtos/device-dtos";
import { MergeDevicesUseCase } from "./application/use-cases/merge-devices";
import { SetMonitorStateUseCase } from "./application/use-cases/monitor-state-use-cases";
import { IgnoreDevicesUseCase, ListPendingDevicesUseCase, RegisterDevicesUseCase, UnignoreUseCase } from "./application/use-cases/registration-use-cases";
import { KnexAuditLogWriter } from "./infrastructure/database/knex-audit-log-writer";
import { KnexDeviceRegistrationRepository } from "./infrastructure/database/knex-device-registration-repository";
import { KnexDeviceRepository } from "./infrastructure/database/knex-device-repository";
import { KnexDeviceUnitOfWork, scopeFor } from "./infrastructure/database/knex-device-unit-of-work";
import { createDeviceBulkController } from "./presentation/device-bulk-controller";
import { buildDeviceBulkUseCases } from "./presentation/device-wiring";

/**
 * Fachada del módulo para los consumidores que viven fuera de él — mismas
 * firmas que tenían `deviceLifecycleService`/`deviceIdentity`/
 * `deviceMonitorService`/`deviceRegistrationService`:
 * - `services/agentService/*` (ingesta): `resolveDeviceIdentity(trx, …)`, `mergeDevices(db, params, trx?)`.
 * - `modules/clients` (gateway de la cola de registro): `listPending`/`registerDevices`/`ignoreDevices`.
 * - `api/routes/portalAgentRoutes.ts`: el handler `decommissionStaleDevices`.
 */
export type { DeviceRow, MergeParams, MergeResult, PendingDeviceRow, MonitorState, ResolvedDevice, MatchedBy, BulkResult, DeviceScope } from "./domain/entities/device";
export { resolveDeviceIdentity } from "./infrastructure/database/knex-device-identity-resolver";
export { isIdentifyingSerial, normalizeMac, NOISE_MODEL_RE } from "./domain/services/device-identity";
export { MergeError, MergeIdentityConflictError, MergeClientMismatchError, MergeTooLargeError, MergeOverlapError } from "./domain/errors/merge-error";
export { BulkActionError, DeviceRegistrationError, MonitorStateError } from "./domain/errors/device-error";
export { MAX_BULK_DEVICE_IDS } from "./domain/services/device-rules";

/** Primitiva única de fusión. Abre su transacción, o compone con la de la ingesta si se le pasa `existingTrx`. */
export function mergeDevices(db: Knex, params: MergeParams, existingTrx?: Knex.Transaction): Promise<MergeResult> {
  if (existingTrx) return new MergeDevicesUseCase(new KnexDeviceUnitOfWork(db)).executeIn(scopeFor(existingTrx), params);
  return new MergeDevicesUseCase(new KnexDeviceUnitOfWork(db)).execute(params);
}

export function setMonitorState(
  db: Knex,
  params: { deviceId: string; state: string; reason?: string | null; actorId?: string | null; ip?: string | null }
): Promise<DeviceRow | null> {
  const input: SetMonitorStateInput = { deviceId: params.deviceId, state: params.state, reason: params.reason, userId: params.actorId ?? null, ipAddress: params.ip ?? null };
  return new SetMonitorStateUseCase(new KnexDeviceRepository(db), new KnexAuditLogWriter(db)).execute(input);
}

export function listPending(db: Knex, params: ListPendingInput): Promise<{ items: PendingDeviceRow[]; total: number }> {
  return new ListPendingDevicesUseCase(new KnexDeviceRegistrationRepository(db)).execute(params);
}

export function registerDevices(db: Knex, params: RegistrationActionInput) {
  return new RegisterDevicesUseCase(new KnexDeviceRegistrationRepository(db), new KnexDeviceUnitOfWork(db)).execute(params);
}

export function ignoreDevices(db: Knex, params: RegistrationActionInput & { reason: string }) {
  return new IgnoreDevicesUseCase(new KnexDeviceRegistrationRepository(db), new KnexDeviceUnitOfWork(db)).execute(params);
}

export function unignore(db: Knex, params: UnignoreInput): Promise<DeviceRow | null> {
  return new UnignoreUseCase(new KnexDeviceRegistrationRepository(db), new KnexAuditLogWriter(db)).execute(params);
}

/** Handler Fastify de la purga por inactividad, para colgarlo de `/agents/:id/...` en `portalAgentRoutes`. */
export function createDecommissionStaleDevicesHandler(db: Knex) {
  return createDeviceBulkController(buildDeviceBulkUseCases(db)).decommissionStaleDevices;
}
