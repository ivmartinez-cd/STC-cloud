import type { Knex } from "knex";
import { readSystemSettings } from "../../../../system-settings";
import { onlyLiveDevices } from "../../../../../api/utils/deviceFilters";
import type { AgentDiscoveryState } from "../../../domain/entities/agent";
import type { AgentStats, ConnectivityDay } from "../../../domain/entities/monitor-detail";
import { readAgentDiscoveryState } from "../../../domain/services/discovery-state";
import { notDecommissionedNotMergedNotIgnored } from "./device-directory";

/** Alertas abiertas de ESTE agente (equipos propios + alertas agent-scoped como
 * `agent_offline`) — mismo `COALESCE(devices.agent_id, alerts.agent_id)` que
 * `alertsForClient()`/`openAlertsSummaryQuery` en el módulo `clients`, pero
 * comparado directo contra `agentId` (no hace falta subir hasta `clients`). */
function openAlertsSummaryForAgent(db: Knex | Knex.Transaction, agentId: string) {
  return db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .where((b) => b.where("devices.agent_id", agentId).orWhere("alerts.agent_id", agentId))
    .andWhere("alerts.resolved", false)
    .select(
      db.raw("COUNT(*)::int as alerts_open"),
      db.raw("COUNT(*) FILTER (WHERE alerts.alert_class = 'availability')::int as alerts_availability")
    )
    .first();
}

/** Equipos GESTIONADOS (`onlyLiveDevices` ya excluye `pending`) de este agente,
 * activos vs. offline por el umbral unificado (`system_settings.
 * device_offline_threshold_minutes`, 26/08/2026) — mismo cutoff que
 * `AGENT_DEVICE_ESTADO_SQL`, bind param `?`. */
function managedDeviceCountsForAgent(db: Knex | Knex.Transaction, agentId: string, offlineCutoff: Date) {
  return db("devices")
    .where("devices.agent_id", agentId)
    .modify((q) => onlyLiveDevices(q, "devices"))
    .select(
      db.raw("COUNT(*)::int as total"),
      db.raw("COUNT(*) FILTER (WHERE devices.last_seen IS NOT NULL AND devices.last_seen >= ?)::int as active", [offlineCutoff])
    )
    .first();
}

function pendingDeviceCountForAgent(db: Knex | Knex.Transaction, agentId: string) {
  return db("devices")
    .where("devices.agent_id", agentId)
    .andWhere("devices.registration_state", "pending")
    .modify((q) => notDecommissionedNotMergedNotIgnored(q, "devices"))
    .count("* as count")
    .first();
}

/** Volumen del mes por SUMA de deltas positivos (no MAX-MIN) — mismo criterio que
 * `MONTHLY_SUBQUERY` en `devices.ts`, pero sumado en una sola fila para todo el agente. */
async function monthlyVolumeForAgent(db: Knex | Knex.Transaction, agentId: string): Promise<number> {
  const { rows } = await db.raw(
    `
    SELECT COALESCE(SUM(GREATEST(total_pages_delta, 0)), 0)::int AS monthly_pages
    FROM (
      SELECT
        time,
        total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta
      FROM readings
      WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
        AND device_id IN (SELECT id FROM devices WHERE agent_id = ? AND merged_into IS NULL)
    ) deltas
    WHERE time >= date_trunc('month', now())
    `,
    [agentId]
  );
  return Number(rows[0]?.monthly_pages ?? 0);
}

/**
 * BARRIDO MANUAL: último `RESCAN`/`FORCE_SCAN` disparado desde el portal y
 * confirmado por el agente (`agent_commands`). Es un evento puntual a pedido.
 *
 * OJO: no es el barrido automático del agente — para eso está
 * `discoveryStateForAgent()` acá abajo. Conviven los dos y se parecen sólo en
 * el nombre.
 */
function lastSweepForAgent(db: Knex | Knex.Transaction, agentId: string) {
  return db("agent_commands")
    .where("agent_id", agentId)
    .whereIn("type", ["RESCAN", "FORCE_SCAN"])
    .andWhere("status", "success")
    .whereNotNull("executed_at")
    .orderBy("executed_at", "desc")
    .select("executed_at")
    .first();
}

/**
 * BARRIDO AUTOMÁTICO CONTINUO: última foto del progreso de discovery que el
 * propio agente mandó en su heartbeat (`agents.discovery_state`, jsonb). Acá no
 * se recalcula nada — el cursor y la vuelta en curso sólo los conoce el agente.
 * `null` = agente sin actualizar que todavía no reporta el campo, o que reportó
 * algo que no cumple la forma del contrato (ver `readAgentDiscoveryState`).
 */
async function discoveryStateForAgent(db: Knex | Knex.Transaction, agentId: string): Promise<AgentDiscoveryState | null> {
  const row = await db("agents").where("id", agentId).select("discovery_state").first();
  return readAgentDiscoveryState(row?.discovery_state);
}

/** Episodios `agent_offline` que se solapan con la ventana [since, ahora] —
 * abiertos sin resolver, o resueltos DENTRO de la ventana (uno resuelto antes
 * de `since` no aporta caída dentro de la ventana). */
function agentOfflineEpisodesSince(db: Knex | Knex.Transaction, agentId: string, since: Date) {
  return db("alerts")
    .where("agent_id", agentId)
    .andWhere("type", "agent_offline")
    .andWhere((q) => q.whereNull("resolved_at").orWhere("resolved_at", ">=", since))
    .select("created_at", "resolved_at");
}

/** Deriva la tira de 30 días + los totales de conectividad (ver docblock de
 * `ConnectivityDay`) a partir de los mismos episodios — un solo query reusado
 * por `getConnectivity30d()` y `getStats()`. */
async function computeConnectivityWindow(
  db: Knex | Knex.Transaction, agentId: string, days: number
): Promise<{ perDay: ConnectivityDay[]; totalDowntimeMinutes: number; episodeCount: number }> {
  const agentRow = await db("agents").where("id", agentId).select("created_at").first();
  const createdAt: Date = agentRow?.created_at ?? new Date(0);
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const episodes: Array<{ created_at: Date; resolved_at: Date | null }> = await agentOfflineEpisodesSince(db, agentId, since);

  const perDay: ConnectivityDay[] = [];
  let totalDowntimeMinutes = 0;
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    let downtimeMs = 0;
    let reconnects = 0;
    for (const ep of episodes) {
      const epStart = ep.created_at > dayStart ? ep.created_at : dayStart;
      const epEnd = (ep.resolved_at ?? now) < dayEnd ? (ep.resolved_at ?? now) : dayEnd;
      if (epEnd > epStart) downtimeMs += epEnd.getTime() - epStart.getTime();
      if (ep.resolved_at && ep.resolved_at >= dayStart && ep.resolved_at < dayEnd) reconnects++;
    }
    const downtimeMinutes = Math.round(downtimeMs / 60_000);
    totalDowntimeMinutes += downtimeMinutes;
    const status: ConnectivityDay["status"] =
      dayEnd <= createdAt || downtimeMinutes >= 23 * 60 ? "sin_contacto" : downtimeMinutes > 0 ? "parcial" : "online";
    perDay.push({ date: dayStart.toISOString().slice(0, 10), status, downtime_minutes: downtimeMinutes, reconnects });
  }
  // "Cortes" = episodios que se solapan con la ventana completa (no por día).
  const episodeCount = episodes.length;
  return { perDay, totalDowntimeMinutes, episodeCount };
}

export async function getAgentConnectivity30d(db: Knex | Knex.Transaction, agentId: string): Promise<ConnectivityDay[]> {
  const { perDay } = await computeConnectivityWindow(db, agentId, 30);
  return perDay;
}

export async function getAgentStats(db: Knex | Knex.Transaction, agentId: string): Promise<AgentStats> {
  const { deviceOfflineThresholdMinutes } = await readSystemSettings(db);
  const offlineCutoff = new Date(Date.now() - deviceOfflineThresholdMinutes * 60 * 1000);
  const [managed, alertsSummary, pending, volumeMonth, lastSweep, connectivity, discoveryState] = await Promise.all([
    managedDeviceCountsForAgent(db, agentId, offlineCutoff),
    openAlertsSummaryForAgent(db, agentId),
    pendingDeviceCountForAgent(db, agentId),
    monthlyVolumeForAgent(db, agentId),
    lastSweepForAgent(db, agentId),
    computeConnectivityWindow(db, agentId, 30),
    discoveryStateForAgent(db, agentId),
  ]);

  const total = Number(managed?.total ?? 0);
  const active = Number(managed?.active ?? 0);
  const lastSweepAt: Date | null = lastSweep?.executed_at ?? null;
  let lastSweepNewCount = 0;
  if (lastSweepAt) {
    const row = await db("devices").where("agent_id", agentId).andWhere("created_at", ">=", lastSweepAt).count("* as count").first();
    lastSweepNewCount = Number(row?.count ?? 0);
  }

  const windowMinutes = 30 * 24 * 60;
  const uptimePct = windowMinutes > 0 ? Math.round((1 - connectivity.totalDowntimeMinutes / windowMinutes) * 1000) / 10 : 100;

  return {
    devices_total: total,
    devices_active: active,
    devices_offline: Math.max(0, total - active),
    alerts_open: Number(alertsSummary?.alerts_open ?? 0),
    alerts_availability: Number(alertsSummary?.alerts_availability ?? 0),
    volume_month: volumeMonth,
    uptime_30d_pct: Math.max(0, Math.min(100, uptimePct)),
    outages_30d: connectivity.episodeCount,
    downtime_30d_minutes: connectivity.totalDowntimeMinutes,
    discovered_pending: Number(pending?.count ?? 0),
    last_sweep_at: lastSweepAt,
    last_sweep_new_count: lastSweepNewCount,
    discovery_state: discoveryState,
  };
}
