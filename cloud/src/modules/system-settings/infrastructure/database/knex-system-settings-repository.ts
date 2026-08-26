import type { Knex } from "knex";
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "../../domain/system-settings";

export class KnexSystemSettingsRepository {
  constructor(private db: Knex) {}

  async get(): Promise<SystemSettings> {
    const row = await this.db("system_settings").where({ id: true }).first();
    if (!row) return DEFAULT_SYSTEM_SETTINGS;
    return {
      agentOfflineThresholdMinutes: row.agent_offline_threshold_minutes,
      deviceOfflineThresholdMinutes: row.device_offline_threshold_minutes,
    };
  }

  /** Patch parcial — sólo escribe las claves presentes, la otra queda como estaba. */
  async update(patch: Partial<SystemSettings>, actorUserId: string | null): Promise<SystemSettings> {
    const columns: Record<string, unknown> = { updated_at: new Date(), updated_by: actorUserId };
    if (patch.agentOfflineThresholdMinutes !== undefined) columns.agent_offline_threshold_minutes = patch.agentOfflineThresholdMinutes;
    if (patch.deviceOfflineThresholdMinutes !== undefined) columns.device_offline_threshold_minutes = patch.deviceOfflineThresholdMinutes;

    const [row] = await this.db("system_settings")
      .where({ id: true })
      .update(columns)
      .returning(["agent_offline_threshold_minutes", "device_offline_threshold_minutes"]);
    return {
      agentOfflineThresholdMinutes: row.agent_offline_threshold_minutes,
      deviceOfflineThresholdMinutes: row.device_offline_threshold_minutes,
    };
  }
}
