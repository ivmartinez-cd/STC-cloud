import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../../api/utils/deviceFilters";
import type { ClientDetailStats } from "../../../domain/entities/client";

/** Tira de métricas "requiere atención" del detalle de cliente — 2 queries chicas y
 * dedicadas, sin tocar `withCounts()`/`clientCountsSelect` (compartidas con el viejo
 * `GET /clients` sin paginar, que no se toca). */
function managedDeviceCountQuery(db: Knex, clientId: string) {
  return db("devices")
    .where("devices.client_id", clientId)
    .andWhere("devices.monitor_state", "full")
    .modify((q) => onlyLiveDevices(q, "devices"))
    .count("* as count")
    .first();
}

function openAlertsSummaryQuery(db: Knex, clientId: string) {
  return db("alerts")
    .leftJoin("devices", "alerts.device_id", "devices.id")
    .leftJoin("agents", "agents.id", db.raw("COALESCE(devices.agent_id, alerts.agent_id)"))
    .where("alerts.resolved", false)
    .andWhere("agents.client_id", clientId)
    .select(
      db.raw("COUNT(*)::int as alerts_open"),
      db.raw("COUNT(*) FILTER (WHERE alerts.alert_class = 'availability')::int as alerts_availability")
    )
    .first();
}

export async function getClientStats(db: Knex, clientId: string): Promise<ClientDetailStats> {
  const [managedRow, alertsRow] = await Promise.all([
    managedDeviceCountQuery(db, clientId),
    openAlertsSummaryQuery(db, clientId),
  ]);
  return {
    managed_device_count: Number(managedRow?.count ?? 0),
    alerts_open_count: Number(alertsRow?.alerts_open ?? 0),
    alerts_availability_count: Number(alertsRow?.alerts_availability ?? 0),
  };
}
