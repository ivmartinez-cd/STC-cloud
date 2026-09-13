import type { Knex } from "knex";
import { deviceIdsOf } from "../../../../api/utils/scope";
import { onlyLiveDevices, notMerged } from "../../../../api/utils/deviceFilters";
import { OPEN_STATUSES } from "../../../supply-requests";
import type { CountRow, DashboardRepository } from "../../domain/repositories/dashboard-repository";

// Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del período):
// un reset/decremento de contador dentro del mes no debe inflar el volumen.
// La ventana interna se extiende 40 días atrás para que la primera lectura
// del mes tenga como base la última lectura del mes anterior. El filtro por
// cliente va DENTRO del subselect con ventana (no afuera, sobre `sub`): así el
// LAG de cada dispositivo sigue viendo su propia lectura previa aunque se
// filtre por cliente.
// Dos SQL literales (con y sin filtro por cliente) en vez de armar el texto por
// interpolación: el único valor variable (`client_id`) viaja como binding.
const MONTHLY_VOLUME_SQL = `
    SELECT SUM(GREATEST(delta, 0))::bigint as total FROM (
      SELECT
        r.time,
        r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) as delta
      FROM readings r
      WHERE r.time >= date_trunc('month', now()) - INTERVAL '40 days'
    ) sub
    WHERE delta IS NOT NULL AND time >= date_trunc('month', now())
  `;

const MONTHLY_VOLUME_BY_CLIENT_SQL = `
    SELECT SUM(GREATEST(delta, 0))::bigint as total FROM (
      SELECT
        r.time,
        r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) as delta
      FROM readings r
      JOIN devices d ON d.id = r.device_id
      WHERE r.time >= date_trunc('month', now()) - INTERVAL '40 days'
        AND d.client_id = ? AND d.merged_into IS NULL
    ) sub
    WHERE delta IS NOT NULL AND time >= date_trunc('month', now())
  `;

export class KnexDashboardRepository implements DashboardRepository {
  constructor(private readonly db: Knex) {}

  devicesCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .count("* as c")
      .first();
  }

  // Fase 6 del gap analysis vs HP SDS — fix real: no filtraba status='revoked'
  // (offlineAgents más abajo sí lo hace), así que un agente revocado inflaba
  // `total` para siempre — de ahí el "1/426" absurdo que se veía comparando
  // contra HP SDS.
  agentsStats(cid: string | null, fiveMinsAgo: Date) {
    return this.db("agents")
      .whereNot("status", "revoked")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .select(
        this.db.raw("COUNT(*)::int as total"),
        this.db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [fiveMinsAgo])
      )
      .first();
  }

  clientsCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("clients")
      .modify((q) => { if (cid) q.where("id", cid); })
      .count("* as c")
      .first();
  }

  monthlyVolume(cid: string | null) {
    return this.db
      .raw(cid ? MONTHLY_VOLUME_BY_CLIENT_SQL : MONTHLY_VOLUME_SQL, cid ? [cid] : [])
      .then((r: { rows: Array<{ total: string | null }> }) => r.rows[0]);
  }

  topClients(cid: string | null) {
    return this.db("clients")
      .select(
        "clients.name",
        "clients.id",
        this.db.raw(
          "COUNT(DISTINCT CASE WHEN devices.decommissioned_at IS NULL AND devices.merged_into IS NULL THEN devices.id END)::int as device_count"
        )
      )
      .leftJoin("devices", "devices.client_id", "clients.id")
      .modify((q) => { if (cid) q.where("clients.id", cid); })
      .groupBy("clients.id", "clients.name")
      .orderBy("device_count", "desc")
      .limit(5);
  }

  brandStats(cid: string | null) {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.where("devices.client_id", cid); })
      .select("brand")
      .count("* as count")
      .groupBy("brand")
      .orderBy("count", "desc")
      .limit(5);
  }

  offlineAgents(cid: string | null, fiveMinsAgo: Date) {
    return this.db("agents")
      .join("clients", "agents.client_id", "clients.id")
      .where((builder: Knex.QueryBuilder) => {
        builder
          .where("agents.last_seen", "<", fiveMinsAgo)
          .orWhereNull("agents.last_seen")
          .orWhere("agents.status", "offline");
      })
      .whereNot("agents.status", "revoked")
      .modify((q) => { if (cid) q.andWhere("agents.client_id", cid); })
      .select("agents.id", "agents.name", "clients.name as client_name", "agents.last_seen")
      .orderBy("agents.last_seen", "desc")
      .limit(10);
  }

  newDevicesCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .count("* as c")
      .first();
  }

  readings24hCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("readings")
      .where("time", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .modify((q) => { if (cid) q.whereIn("device_id", deviceIdsOf(this.db, cid)); })
      .count("* as c")
      .first();
  }

  lastReadingInfo(cid: string | null) {
    return this.db("readings")
      .join("devices", "readings.device_id", "devices.id")
      .join("clients", "devices.client_id", "clients.id")
      .modify((q) => notMerged(q, "devices"))
      .modify((q) => { if (cid) q.where("devices.client_id", cid); })
      .orderBy("readings.time", "desc")
      .select("readings.time", "clients.name as client_name")
      .first();
  }

  clientsWithAlertsCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("alerts")
      .join("devices", "alerts.device_id", "devices.id")
      .where("alerts.resolved", false)
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.andWhere("devices.client_id", cid); })
      .countDistinct("devices.client_id as c")
      .first();
  }

  // "Gestionados / no gestionados" (Fase 6) — se DERIVA de `monitor_state`
  // (Fase 5), no de un flag nuevo: un equipo `disabled` es la definición de "no
  // gestionado". Campo aditivo (`stats.devicesUnmanaged`), no se cambia la
  // forma de `stats.devices` para no romper consumidores existentes.
  devicesUnmanagedCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .where("monitor_state", "disabled")
      .count("* as c")
      .first();
  }

  // "% reportando": agentes con AL MENOS un equipo con lectura en las últimas
  // 24h — deliberadamente sobre `devices.last_seen` (datos), no `agents.last_seen`
  // (heartbeat, ya cubierto por `online` arriba) ni sobre `readings` crudo
  // (sería un scan caro en cada poll del dashboard). Tabla chica, índice por agent_id.
  agentsReportingCount(cid: string | null, twentyFourHoursAgo: Date): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .where("last_seen", ">=", twentyFourHoursAgo)
      .countDistinct("agent_id as c")
      .first();
  }

  // Distribución de versiones de agente en la flota — `agents.version` ya existe
  // (`20260517000000_agent_system_telemetry.ts`) y la escribe `agentService.ts`
  // en cada heartbeat.
  // Agrupado por versión Y canal: el parque corre `stable` y `legacy` a la vez,
  // con runtimes distintos, y cada uno se actualiza contra su propio release.
  // Juntarlos en una sola fila escondía que un canal se quedó atrás.
  agentVersionRows(cid: string | null) {
    return this.db("agents")
      .whereNot("status", "revoked")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .select(
        this.db.raw("COALESCE(NULLIF(version, ''), 'desconocida') as version"),
        this.db.raw("COALESCE(NULLIF(channel, ''), 'stable') as channel")
      )
      .count("* as count")
      .groupBy("version", "channel")
      .orderBy("count", "desc")
      .limit(10);
  }

  // "Descubiertos hoy/ayer" — `devices.created_at` YA es la fecha de
  // descubrimiento (no hace falta una columna nueva).
  discoveredTodayCount(cid: string | null, startOfToday: Date): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .where("created_at", ">=", startOfToday)
      .count("* as c")
      .first();
  }

  discoveredYesterdayCount(cid: string | null, startOfYesterday: Date, startOfToday: Date): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .whereBetween("created_at", [startOfYesterday, startOfToday])
      .count("* as c")
      .first();
  }

  // Fase 7 del gap analysis vs HP SDS — completa el placeholder que dejó la
  // Fase 6: total real de la cola de pendientes.
  pendingDevicesTotalCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("devices")
      .where("registration_state", "pending")
      .whereNull("decommissioned_at")
      .whereNull("merged_into")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .count("* as c")
      .first();
  }

  // Franja "Estadísticas" del dashboard (rediseño estilo HP SDS): "dispositivos
  // reportando" = equipos vivos con lectura en 24h — misma base (`devices.last_seen`)
  // que `agentsReportingCount`, así los dos porcentajes son comparables.
  devicesReportingCount(cid: string | null, twentyFourHoursAgo: Date): Promise<CountRow | undefined> {
    return this.db("devices")
      .modify((q) => onlyLiveDevices(q, "devices"))
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .where("last_seen", ">=", twentyFourHoursAgo)
      .count("* as c")
      .first();
  }

  // Badge "Incidentes" del sidebar (handoff hifi "Sidebar", 26/08/2026) — query
  // propia y aislada (no reusa `getIncidentStats` de `services/incidentService`)
  // para no depender de una función bajo desarrollo activo en paralelo.
  incidentsOpenCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("incidents")
      .whereIn("status", ["open", "in_progress", "on_hold"])
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .count("* as c")
      .first();
  }

  // Badge "Pedidos" del sidebar (handoff hifi "Sidebar", 26/08/2026) — mismos
  // estados que la propia feature de pedidos considera abiertos (`OPEN_STATUSES`),
  // no sólo `pending`, para no desalinearse si esa lista cambia.
  supplyRequestsPendingCount(cid: string | null): Promise<CountRow | undefined> {
    return this.db("supply_requests")
      .whereIn("status", OPEN_STATUSES as string[])
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .count("* as c")
      .first();
  }

  // Panel "Movimientos y cambios" (HP SDS): cantidad de entradas de auditoría de
  // hoy y ayer + total histórico. `audit_logs.client_id` es nullable (acciones
  // globales), por eso el scope por cliente sólo filtra cuando hay cid.
  movementsCounts(cid: string | null, startOfYesterday: Date) {
    return this.db("audit_logs")
      .modify((q) => { if (cid) q.where("client_id", cid); })
      .select(
        this.db.raw("COUNT(*)::int as total"),
        this.db.raw("COUNT(CASE WHEN created_at >= ? THEN 1 END)::int as recent", [startOfYesterday])
      )
      .first();
  }
}
