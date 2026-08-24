import type { Knex } from "knex";
import { createDeviceReadHandlers } from "./reads";
import { createDeviceCrudHandlers } from "./crud";
import { createDeviceLifecycleHandlers } from "./lifecycle";
import { createDeviceMergeHandlers } from "./merge";
import { createDeviceMonitorStateHandlers } from "./monitor-state";
import { createDeviceBulkHandlers } from "./bulk";

/**
 * Controller de dispositivos (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 777 líneas). Mismo objeto de handlers
 * que devolvía el archivo original; ningún import externo cambia.
 */
export function createDeviceController(db: Knex) {
  return {
    ...createDeviceReadHandlers(db),
    ...createDeviceCrudHandlers(db),
    ...createDeviceLifecycleHandlers(db),
    ...createDeviceMergeHandlers(db),
    ...createDeviceMonitorStateHandlers(db),
    ...createDeviceBulkHandlers(db),
  };
}
