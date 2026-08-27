import type { SuppliesRepository } from "../../domain/repositories/supplies-repository";
import type { SupplyRow, UsageRate } from "../../domain/entities/supply-row";
import { EMPTY_RATE } from "../../domain/entities/supply-row";
import { buildSupplyRows, parseSuppliesDetails } from "../../domain/services/supply-row-builder";

export class GetDeviceSuppliesUseCase {
  constructor(private readonly repo: SuppliesRepository) {}

  async execute(deviceId: string): Promise<{ rate: UsageRate; rows: SupplyRow[] } | null> {
    const device = await this.repo.findDeviceById(deviceId);
    if (!device) return null;
    const rateMap = await this.repo.usageRatesFor([deviceId]);
    const rate = rateMap.get(deviceId) ?? EMPTY_RATE;
    const rows = buildSupplyRows(device, parseSuppliesDetails(device.supplies_details), rate);
    return { rate, rows };
  }
}
