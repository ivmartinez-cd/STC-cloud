import type { Knex } from "knex";
import { createClientCrudHandlers } from "./crud";
import { createClientReadHandlers } from "./reads";
import { createClientPendingDeviceHandlers } from "./pending-devices";
import { createClientApiKeyHandlers } from "./api-keys";
import { createClientWebhookHandlers } from "./webhook";

/**
 * Controller de clientes (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 345 líneas). Mismo objeto de handlers
 * que devolvía el archivo original; ningún import externo cambia.
 */
export function createClientController(db: Knex) {
  return {
    ...createClientCrudHandlers(db),
    ...createClientReadHandlers(db),
    ...createClientPendingDeviceHandlers(db),
    ...createClientApiKeyHandlers(db),
    ...createClientWebhookHandlers(db),
  };
}
