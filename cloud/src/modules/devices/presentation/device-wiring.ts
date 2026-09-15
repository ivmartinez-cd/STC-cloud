import type { Knex } from "knex";
import { BulkDecommissionUseCase, BulkMoveUseCase, BulkRecommissionUseCase } from "../application/use-cases/bulk-lifecycle-use-cases";
import { DecommissionStaleDevicesUseCase } from "../application/use-cases/decommission-stale-devices";
import { GetDeviceDirectoryUseCase, GetDeviceInventorySummaryUseCase } from "../application/use-cases/device-directory-use-cases";
import { DeleteDeviceUseCase } from "../application/use-cases/delete-device";
import {
  GetDevicePrintTrendUseCase, GetDeviceReadingsUseCase, GetDeviceStatsUseCase, GetDeviceSuppliesUseCase,
  GetDeviceUsageHistoryUseCase, GetDeviceUseCase, GetSupplyHistoryUseCase, ListDevicesUseCase, ListDuplicatesUseCase,
} from "../application/use-cases/device-read-use-cases";
import { DecommissionDeviceUseCase, RecommissionDeviceUseCase } from "../application/use-cases/lifecycle-use-cases";
import { MergeDeviceRequestUseCase, MergeDevicesUseCase } from "../application/use-cases/merge-devices";
import { BulkSetMonitorStateUseCase, SetMonitorStateUseCase, UpdateMonitorStateUseCase } from "../application/use-cases/monitor-state-use-cases";
import { MoveDeviceUseCase } from "../application/use-cases/move-device";
import {
  ApprovePendingQueueUseCase, GetPendingQueueSummaryUseCase, IgnorePendingQueueUseCase, ListPendingQueueUseCase,
} from "../application/use-cases/pending-queue-use-cases";
import { UnignoreDeviceRequestUseCase, UnignoreUseCase } from "../application/use-cases/registration-use-cases";
import { UpdateDeviceUseCase } from "../application/use-cases/update-device";
import { InventoryCustomFieldMerger } from "../infrastructure/adapters/inventory-custom-field-merger";
import { SuppliesServiceDeviceSuppliesReader } from "../infrastructure/adapters/supplies-device-supplies-reader";
import { KnexAuditLogWriter } from "../infrastructure/database/knex-audit-log-writer";
import { KnexDeviceRegistrationRepository } from "../infrastructure/database/knex-device-registration-repository";
import { KnexDeviceRepository } from "../infrastructure/database/knex-device-repository";
import { KnexDeviceUnitOfWork } from "../infrastructure/database/knex-device-unit-of-work";
import type { DeviceBulkUseCases } from "./device-bulk-controller";
import type { DeviceUseCases } from "./device-controller";

/** Handoff hifi "Dispositivos pendientes" (25/08/2026) — cola cross-cliente,
 * separado de `buildDeviceUseCases` para no cruzar el límite de 20 líneas/función. */
function buildPendingQueueUseCases(registration: KnexDeviceRegistrationRepository, unitOfWork: KnexDeviceUnitOfWork) {
  return {
    pendingQueue: new ListPendingQueueUseCase(registration),
    pendingQueueSummary: new GetPendingQueueSummaryUseCase(registration),
    approvePendingQueue: new ApprovePendingQueueUseCase(registration, unitOfWork),
    ignorePendingQueue: new IgnorePendingQueueUseCase(registration, unitOfWork),
  };
}

/** Ciclo de vida single-device — separado de `buildDeviceUseCases` para no
 * cruzar el límite de 20 líneas/función (mismo motivo que `buildPendingQueueUseCases`). */
function buildLifecycleUseCases(devices: KnexDeviceRepository, unitOfWork: KnexDeviceUnitOfWork, audit: KnexAuditLogWriter) {
  return {
    decommission: new DecommissionDeviceUseCase(unitOfWork), recommission: new RecommissionDeviceUseCase(devices, audit),
    move: new MoveDeviceUseCase(unitOfWork),
    merge: new MergeDeviceRequestUseCase(new MergeDevicesUseCase(unitOfWork), (ids: string[], clientId: string) => devices.countOwned(ids, clientId)),
  };
}

/** Los tres casos de uso que necesitan el puerto de consumibles — agrupados para
 * no cruzar el límite de 20 líneas/función (mismo motivo que `buildLifecycleUseCases`). */
function buildSuppliesUseCases(devices: KnexDeviceRepository, suppliesReader: SuppliesServiceDeviceSuppliesReader) {
  return {
    supplies: new GetDeviceSuppliesUseCase(devices, suppliesReader),
    supplyHistory: new GetSupplyHistoryUseCase(devices, suppliesReader),
    stats: new GetDeviceStatsUseCase(devices, suppliesReader),
  };
}

/** Composición de los casos de uso HTTP del módulo — un solo lugar para el cableado de adaptadores. */
export function buildDeviceUseCases(db: Knex): DeviceUseCases {
  const devices = new KnexDeviceRepository(db);
  const audit = new KnexAuditLogWriter(db);
  const unitOfWork = new KnexDeviceUnitOfWork(db);
  const setMonitorState = new SetMonitorStateUseCase(devices, audit);
  const suppliesReader = new SuppliesServiceDeviceSuppliesReader(db);
  const registration = new KnexDeviceRegistrationRepository(db);
  return {
    list: new ListDevicesUseCase(devices), get: new GetDeviceUseCase(devices), readings: new GetDeviceReadingsUseCase(devices),
    ...buildSuppliesUseCases(devices, suppliesReader),
    usageHistory: new GetDeviceUsageHistoryUseCase(devices), duplicates: new ListDuplicatesUseCase(devices),
    printTrend: new GetDevicePrintTrendUseCase(devices),
    directory: new GetDeviceDirectoryUseCase(devices), inventorySummary: new GetDeviceInventorySummaryUseCase(devices),
    update: new UpdateDeviceUseCase(devices, new InventoryCustomFieldMerger(db), audit), remove: new DeleteDeviceUseCase(unitOfWork),
    ...buildLifecycleUseCases(devices, unitOfWork, audit),
    monitorState: new UpdateMonitorStateUseCase(devices, setMonitorState),
    unignore: new UnignoreDeviceRequestUseCase(devices, new UnignoreUseCase(registration, audit)),
    ...buildPendingQueueUseCases(registration, unitOfWork),
  };
}

export function buildDeviceBulkUseCases(db: Knex): DeviceBulkUseCases {
  const devices = new KnexDeviceRepository(db);
  const unitOfWork = new KnexDeviceUnitOfWork(db);
  return {
    bulkDecommission: new BulkDecommissionUseCase(unitOfWork),
    bulkRecommission: new BulkRecommissionUseCase(unitOfWork),
    bulkMove: new BulkMoveUseCase(unitOfWork),
    bulkMonitorState: new BulkSetMonitorStateUseCase(devices, new SetMonitorStateUseCase(devices, new KnexAuditLogWriter(db))),
    decommissionStale: new DecommissionStaleDevicesUseCase(devices, unitOfWork),
  };
}
