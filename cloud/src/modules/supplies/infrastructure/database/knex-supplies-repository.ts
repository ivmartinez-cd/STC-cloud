import { Knex } from "knex";
import { alertableDevices } from "../../../../api/utils/deviceFilters";
import { OPEN_STATUSES } from "../../../supply-requests";
import type {
  FleetDeviceParams, FleetDeviceRow, SuppliesDeviceRow, SuppliesRepository,
} from "../../domain/repositories/supplies-repository";
import type { UsageRate } from "../../domain/entities/supply-row";
import type {
  SupplyHistoryDevice, SupplyLevelPoint, SupplyRequestHistoryRow,
} from "../../domain/entities/supply-history";
import { selectHistoryDevice, selectLevelSeries, selectRequestHistory } from "./knex-supply-history-queries";

// Techo de seguridad, mismo criterio que listClients/listAgents/listDevices
// (auditoría de capacidad 23/08/2026) — no es paginación real de dispositivos,
// sólo evita construir filas para una flota sin límite antes de filtrar/paginar.
const FLEET_DEVICE_CAP = 3000;

export class KnexSuppliesRepository implements SuppliesRepository {
  constructor(private readonly db: Knex) {}

  async findDeviceById(deviceId: string): Promise<SuppliesDeviceRow | null> {
    const device = await this.db("devices").where({ id: deviceId }).first();
    return device ?? null;
  }

  async fleetDevices(params: FleetDeviceParams): Promise<FleetDeviceRow[]> {
    return this.db("devices")
      .leftJoin("clients", "clients.id", "devices.client_id")
      .leftJoin("agents", "agents.id", "devices.agent_id")
      // `alertableDevices` (vivo + monitor_state en full/supplies_only), no
      // `onlyLiveDevices` a secas: un equipo `disabled` no debe aparecer acá —
      // mismo criterio que `alertService.openAlert` ya aplica para alertas de
      // tóner sobre el mismo equipo (Fase 5). `reports_only` tampoco: ese
      // estado es "sólo contadores", análogo a "no monitorear consumibles".
      .modify((q) => alertableDevices(q, "devices"))
      .modify((q) => {
        if (params.clientId) q.where("devices.client_id", params.clientId);
        if (params.agentId) q.where("devices.agent_id", params.agentId);
      })
      .select(
        "devices.*",
        "clients.id as client_id_join", "clients.name as client_name",
        "agents.name as agent_name"
      )
      .limit(FLEET_DEVICE_CAP);
  }

  /**
   * Ritmo de impresión de los últimos 30 días — reusa `device_usage_30d`
   * (vista creada en la Fase 4, `SUM(GREATEST(delta,0))` sobre
   * `readings_daily_agg`, mismo criterio anti-reset que el volumen mensual del
   * dashboard/reportService) en vez de reimplementar el cálculo de deltas acá.
   * Una sola query para N dispositivos — nunca N+1.
   */
  async usageRatesFor(deviceIds: string[]): Promise<Map<string, UsageRate>> {
    const map = new Map<string, UsageRate>();
    if (deviceIds.length === 0) return map;
    const rows = await this.db("device_usage_30d").whereIn("device_id", deviceIds);
    for (const r of rows) {
      map.set(r.device_id, {
        totalPerDay: r.pages_30d != null ? Number(r.pages_30d) / 30 : null,
        colorPerDay: r.color_30d != null ? Number(r.color_30d) / 30 : null,
        monoPerDay: r.mono_30d != null ? Number(r.mono_30d) / 30 : null,
        spanDays: 30,
      });
    }
    return map;
  }

  /** `supply_requests` no tiene `agent_id`: el filtro por sede se resuelve por los equipos de ese agente. */
  async countOpenSupplyRequests(params: FleetDeviceParams): Promise<number> {
    const [{ n }] = await this.db("supply_requests")
      .whereIn("status", OPEN_STATUSES as readonly string[])
      .modify((q) => {
        if (params.clientId) q.where("supply_requests.client_id", params.clientId);
        if (params.agentId) {
          q.whereIn("supply_requests.device_id", this.db("devices").select("id").where("agent_id", params.agentId));
        }
      })
      .count("* as n");
    return Number(n);
  }

  historyDevice(deviceId: string): Promise<SupplyHistoryDevice | null> {
    return selectHistoryDevice(this.db, deviceId);
  }

  levelSeries(deviceId: string, supplyKey: string): Promise<SupplyLevelPoint[]> {
    return selectLevelSeries(this.db, deviceId, supplyKey);
  }

  requestHistory(deviceId: string, supplyKey: string): Promise<SupplyRequestHistoryRow[]> {
    return selectRequestHistory(this.db, deviceId, supplyKey);
  }
}
