import type { Knex } from "knex";
import { deviceSupplies } from "../../../../services/suppliesService";
import type { DeviceSuppliesReader } from "../../application/ports/device-supplies-reader";

/** Adapter sobre `services/suppliesService.deviceSupplies` (única implementación del cálculo de consumibles). */
export class SuppliesServiceDeviceSuppliesReader implements DeviceSuppliesReader {
  constructor(private readonly db: Knex) {}

  read(deviceId: string): Promise<unknown | null> {
    return deviceSupplies(this.db, deviceId);
  }
}
