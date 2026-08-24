import type { Knex } from "knex";
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "../../domain/system-settings";

export class KnexSystemSettingsRepository {
  constructor(private db: Knex) {}

  async get(): Promise<SystemSettings> {
    const row = await this.db("system_settings").where({ id: true }).first();
    if (!row) return DEFAULT_SYSTEM_SETTINGS;
    return { agentOfflineThresholdMinutes: row.agent_offline_threshold_minutes };
  }

  async setAgentOfflineThresholdMinutes(minutes: number, actorUserId: string | null): Promise<SystemSettings> {
    const [row] = await this.db("system_settings")
      .where({ id: true })
      .update({ agent_offline_threshold_minutes: minutes, updated_at: new Date(), updated_by: actorUserId })
      .returning("agent_offline_threshold_minutes");
    return { agentOfflineThresholdMinutes: row.agent_offline_threshold_minutes };
  }
}
