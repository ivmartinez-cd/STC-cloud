import type { Knex } from "knex";
import { decryptSecret, encryptSecret } from "../../../../services/cryptoService";
import { DEFAULT_SYSTEM_SETTINGS, type SmtpEncryption, type SystemSettings, type SystemSettingsPatch } from "../../domain/system-settings";

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(row: any): SystemSettings {
  return {
    agentOfflineThresholdMinutes: row.agent_offline_threshold_minutes,
    deviceOfflineThresholdMinutes: row.device_offline_threshold_minutes,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpUser: row.smtp_user,
    smtpPasswordSet: !!row.smtp_password_encrypted,
    smtpFrom: row.smtp_from,
    smtpEncryption: row.smtp_encryption as SmtpEncryption,
    supplyThresholdWarningPct: row.supply_threshold_warning_pct,
    supplyThresholdCriticalPct: row.supply_threshold_critical_pct,
    supplyManualReviewRequired: row.supply_manual_review_required,
  };
}

/** Sólo escribe las claves presentes en `patch` — el resto queda como estaba.
 * `smtpPassword`: `undefined` no toca la columna, `null` la borra (vuelve a
 * "sin configurar"), un string la cifra con `purpose:"smtp"`. */
function toColumns(patch: SystemSettingsPatch, actorUserId: string | null): Record<string, unknown> {
  const columns: Record<string, unknown> = { updated_at: new Date(), updated_by: actorUserId };
  if (patch.agentOfflineThresholdMinutes !== undefined) columns.agent_offline_threshold_minutes = patch.agentOfflineThresholdMinutes;
  if (patch.deviceOfflineThresholdMinutes !== undefined) columns.device_offline_threshold_minutes = patch.deviceOfflineThresholdMinutes;
  if (patch.smtpHost !== undefined) columns.smtp_host = patch.smtpHost;
  if (patch.smtpPort !== undefined) columns.smtp_port = patch.smtpPort;
  if (patch.smtpUser !== undefined) columns.smtp_user = patch.smtpUser;
  if (patch.smtpFrom !== undefined) columns.smtp_from = patch.smtpFrom;
  if (patch.smtpEncryption !== undefined) columns.smtp_encryption = patch.smtpEncryption;
  if (patch.supplyThresholdWarningPct !== undefined) columns.supply_threshold_warning_pct = patch.supplyThresholdWarningPct;
  if (patch.supplyThresholdCriticalPct !== undefined) columns.supply_threshold_critical_pct = patch.supplyThresholdCriticalPct;
  if (patch.supplyManualReviewRequired !== undefined) columns.supply_manual_review_required = patch.supplyManualReviewRequired;
  if (patch.smtpPassword !== undefined) {
    columns.smtp_password_encrypted = patch.smtpPassword === null ? null : encryptSecret(patch.smtpPassword, "smtp");
  }
  return columns;
}

export class KnexSystemSettingsRepository {
  constructor(private db: Knex) {}

  async get(): Promise<SystemSettings> {
    const row = await this.db("system_settings").where({ id: true }).first();
    if (!row) return DEFAULT_SYSTEM_SETTINGS;
    return fromRow(row);
  }

  /** Contraseña SMTP en texto plano — SÓLO para el mailer al momento de enviar/probar,
   * nunca sale por HTTP (`get()`/`toView` sólo exponen `smtpPasswordSet`). */
  async getSmtpPasswordPlaintext(): Promise<string | null> {
    const row = await this.db("system_settings").where({ id: true }).select("smtp_password_encrypted").first();
    if (!row?.smtp_password_encrypted) return null;
    return decryptSecret(row.smtp_password_encrypted, "smtp");
  }

  async update(patch: SystemSettingsPatch, actorUserId: string | null): Promise<SystemSettings> {
    const [row] = await this.db("system_settings").where({ id: true }).update(toColumns(patch, actorUserId)).returning("*");
    return fromRow(row);
  }
}
