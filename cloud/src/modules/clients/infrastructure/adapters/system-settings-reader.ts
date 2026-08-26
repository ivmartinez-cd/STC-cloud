import type { Knex } from "knex";
import { readSystemSettings } from "../../../system-settings";
import type { SystemSettingsReader } from "../../application/ports/system-settings-reader";

export class KnexSystemSettingsReader implements SystemSettingsReader {
  constructor(private readonly db: Knex) {}

  async getSupplyThresholdCriticalPct(): Promise<number> {
    return (await readSystemSettings(this.db)).supplyThresholdCriticalPct;
  }
}
