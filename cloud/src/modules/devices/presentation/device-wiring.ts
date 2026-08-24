import type { Knex } from "knex";
import { BulkDecommissionUseCase, BulkMoveUseCase, BulkRecommissionUseCase } from "../application/use-cases/bulk-lifecycle-use-cases";
import { DecommissionStaleDevicesUseCase } from "../application/use-cases/decommission-stale-devices";
import { DeleteDeviceUseCase } from "../application/use-cases/delete-device";
import {
  GetDeviceReadingsUseCase, GetDeviceSuppliesUseCase, GetDeviceUsageHistoryUseCase, GetDeviceUseCase,
  ListDevicesUseCase, ListDuplicatesUseCase,
} from "../application/use-cases/device-read-use-cases";
import { DecommissionDeviceUseCase, RecommissionDeviceUseCase } from "../application/use-cases/lifecycle-use-cases";
import { MergeDeviceRequestUseCase, MergeDevicesUseCase } from "../application/use-cases/merge-devices";
import { BulkSetMonitorStateUseCase, SetMonitorStateUseCase, UpdateMonitorStateUseCase } from "../application/use-cases/monitor-state-use-cases";
import { MoveDeviceUseCase } from "../application/use-cases/move-device";
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

/** Composición de los casos de uso HTTP del módulo — un solo lugar para el cableado de adaptadores. */
export function buildDeviceUseCases(db: Knex): DeviceUseCases {
  const devices = new KnexDeviceRepository(db);
  const audit = new KnexAuditLogWriter(db);
  const unitOfWork = new KnexDeviceUnitOfWork(db);
  const setMonitorState = new SetMonitorStateUseCase(devices, audit);
  return {
    list: new ListDevicesUseCase(devices), get: new GetDeviceUseCase(devices), readings: new GetDeviceReadingsUseCase(devices),
    supplies: new GetDeviceSuppliesUseCase(devices, new SuppliesServiceDeviceSuppliesReader(db)),
    usageHistory: new GetDeviceUsageHistoryUseCase(devices), duplicates: new ListDuplicatesUseCase(devices),
    update: new UpdateDeviceUseCase(devices, new InventoryCustomFieldMerger(db), audit), remove: new DeleteDeviceUseCase(unitOfWork),
    decommission: new DecommissionDeviceUseCase(unitOfWork), recommission: new RecommissionDeviceUseCase(devices, audit),
    move: new MoveDeviceUseCase(unitOfWork),
    merge: new MergeDeviceRequestUseCase(new MergeDevicesUseCase(unitOfWork), (ids, clientId) => devices.countOwned(ids, clientId)),
    monitorState: new UpdateMonitorStateUseCase(devices, setMonitorState),
    unignore: new UnignoreDeviceRequestUseCase(devices, new UnignoreUseCase(new KnexDeviceRegistrationRepository(db), audit)),
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
