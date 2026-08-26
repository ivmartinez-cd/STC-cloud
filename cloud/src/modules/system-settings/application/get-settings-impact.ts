import type { Knex } from "knex";
import { suppliesCountBelowThreshold } from "../../../services/suppliesService/queries";

export interface SettingsImpact {
  agentOffline: { affected: number; total: number };
  deviceOffline: { affected: number; total: number };
  supplyWarning: { affected: number };
  supplyCritical: { affected: number };
}

/** "Con el valor actual, 875 de 876 monitores quedan marcados sin señal"
 * (handoff hifi #3, fase 2, 26/08/2026) — mismo criterio de staleness que
 * `jobs/heartbeatMonitor.ts::checkOfflineAgents` (`last_seen < cutoff`),
 * pero sobre el valor que el admin está arrastrando en el slider, no el
 * guardado — así ve el impacto ANTES de guardar. */
async function agentOfflineImpact(db: Knex, thresholdMinutes: number): Promise<SettingsImpact["agentOffline"]> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
  const [affectedRow, totalRow] = await Promise.all([
    db("agents").where((q) => q.whereNull("last_seen").orWhere("last_seen", "<", cutoff)).count("* as n").first(),
    db("agents").count("* as n").first(),
  ]);
  return { affected: Number(affectedRow?.n ?? 0), total: Number(totalRow?.n ?? 0) };
}

/** Mismo filtro que `checkOfflineDevices` (activo, no dado de baja, no fusionado,
 * agente no offline) — así "genera N alertas de device_offline" es exacto, no aproximado. */
async function deviceOfflineImpact(db: Knex, thresholdMinutes: number): Promise<SettingsImpact["deviceOffline"]> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
  const base = () => db("devices").join("agents", "devices.agent_id", "agents.id")
    .where("devices.active", true).whereNull("devices.decommissioned_at").whereNull("devices.merged_into");
  const [affectedRow, totalRow] = await Promise.all([
    base().where("devices.last_seen", "<", cutoff).whereNot("agents.status", "offline").count("* as n").first(),
    base().count("* as n").first(),
  ]);
  return { affected: Number(affectedRow?.n ?? 0), total: Number(totalRow?.n ?? 0) };
}

export interface GetSettingsImpactInput {
  agentOfflineThresholdMinutes: number;
  deviceOfflineThresholdMinutes: number;
  supplyThresholdWarningPct: number;
  supplyThresholdCriticalPct: number;
}

export async function getSettingsImpact(db: Knex, input: GetSettingsImpactInput): Promise<SettingsImpact> {
  const [agentOffline, deviceOffline, supplyWarningAffected, supplyCriticalAffected] = await Promise.all([
    agentOfflineImpact(db, input.agentOfflineThresholdMinutes),
    deviceOfflineImpact(db, input.deviceOfflineThresholdMinutes),
    suppliesCountBelowThreshold(db, input.supplyThresholdWarningPct),
    suppliesCountBelowThreshold(db, input.supplyThresholdCriticalPct),
  ]);
  return { agentOffline, deviceOffline, supplyWarning: { affected: supplyWarningAffected }, supplyCritical: { affected: supplyCriticalAffected } };
}
