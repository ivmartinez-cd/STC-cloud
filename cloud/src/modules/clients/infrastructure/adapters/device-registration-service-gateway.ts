import type { Knex } from "knex";
import * as deviceRegistrationService from "../../../devices";
import type {
  DeviceRegistrationGateway, ListPendingDevicesQuery, PendingDeviceActionInput,
} from "../../application/ports/device-registration-gateway";

/**
 * Adapter sobre la fachada de `modules/devices` (cola de registro). Sus `DeviceRegistrationError`
 * (con `statusCode`) se dejan propagar tal cual — el controller las traduce
 * igual que antes.
 */
export class DeviceRegistrationServiceGateway implements DeviceRegistrationGateway {
  constructor(private readonly db: Knex) {}

  listPending(query: ListPendingDevicesQuery): Promise<unknown> {
    return deviceRegistrationService.listPending(this.db, query);
  }

  register(input: PendingDeviceActionInput): Promise<unknown> {
    return deviceRegistrationService.registerDevices(this.db, input);
  }

  ignore(input: PendingDeviceActionInput & { reason: string }): Promise<unknown> {
    return deviceRegistrationService.ignoreDevices(this.db, input);
  }
}
