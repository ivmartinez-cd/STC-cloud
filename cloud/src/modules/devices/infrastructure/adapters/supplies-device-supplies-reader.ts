import type { Knex } from "knex";
import { deviceSupplies, supplyHistory } from "../../../supplies";
import type { DeviceLowestSupply } from "../../domain/entities/device-detail";
import type { DeviceSuppliesReader } from "../../application/ports/device-supplies-reader";

/** Adapter sobre `services/suppliesService.deviceSupplies` (única implementación del cálculo de consumibles). */
export class SuppliesServiceDeviceSuppliesReader implements DeviceSuppliesReader {
  constructor(private readonly db: Knex) {}

  read(deviceId: string): Promise<unknown | null> {
    return deviceSupplies(this.db, deviceId);
  }

  history(deviceId: string, supplyKey: string): Promise<unknown | null> {
    return supplyHistory(this.db, deviceId, supplyKey);
  }

  async lowest(deviceId: string): Promise<DeviceLowestSupply | null> {
    const result = await deviceSupplies(this.db, deviceId);
    if (!result) return null;
    const withPct = result.rows.filter((r) => r.percentage != null);
    if (!withPct.length) return null;
    const lowest = withPct.reduce((min, r) => (r.percentage! < min.percentage! ? r : min));
    return { pct: lowest.percentage!, label: lowest.description, remaining_pages: lowest.remainingPages };
  }
}
