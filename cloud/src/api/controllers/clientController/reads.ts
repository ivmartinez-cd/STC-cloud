import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getScope } from "../../utils/scope";
import { onlyLiveDevices, notMerged } from "../../utils/deviceFilters";

function clientCountsSelect(db: Knex) {
  return [
    db.raw("COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"),
  ];
}

async function listClients(db: Knex, request: FastifyRequest) {
  const scope = getScope(request);
  return await db("clients")
    .modify((q) => {
      if (scope.kind === "client") q.where("clients.id", scope.id);
    })
    .select("clients.*", ...clientCountsSelect(db))
    .leftJoin("agents as a", "a.client_id", "clients.id")
    .leftJoin("devices as d", "d.client_id", "clients.id")
    .groupBy("clients.id")
    .orderBy("clients.name")
    // Antes sin límite (auditoría de capacidad, 200+ clientes) — techo de
    // seguridad, no paginación real todavía. Ver mismo comentario en
    // portalAgentController.listAgents.
    .limit(2000);
}

async function getClient(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  return await db("clients")
    .where("clients.id", id)
    .select("clients.*", ...clientCountsSelect(db))
    .leftJoin("agents as a", "a.client_id", "clients.id")
    .leftJoin("devices as d", "d.client_id", "clients.id")
    .groupBy("clients.id")
    .first();
}

async function getClientMonitors(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  return await db("agents")
    .where("agents.client_id", id)
    .select(
      "agents.id",
      "agents.name",
      "agents.status",
      "agents.last_seen",
      "agents.hardware_id",
      "agents.host_name",
      "agents.scan_interval_minutes",
      // `ip_ranges` es topología interna de la LAN del cliente — sólo para
      // admin/operator, no para un client_viewer de sólo lectura.
      ...(scope.kind === "all" ? ["agents.ip_ranges"] : []),
      db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count")
    )
    .leftJoin("devices as d", "d.agent_id", "agents.id")
    .groupBy("agents.id")
    .orderBy("agents.name");
}

// Suma de deltas positivos entre lecturas consecutivas por dispositivo (no MAX-MIN
// del mes): un reset/decremento de contador no debe inflar ni romper el volumen.
// El CTE calcula deltas sobre una ventana extendida 40 días atrás de los 4 meses
// mostrados, para que el primer delta de cada mes tome como base la última
// lectura del mes anterior; el filtro por mes se aplica después, sobre la fecha
// de la lectura actual (no sobre la que se usa como base).
async function getClientUsage(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  const result = await db.raw(
    `
    WITH deltas AS (
      SELECT
        r.time,
        r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE d.client_id = ?
        AND d.merged_into IS NULL
        AND r.time >= date_trunc('month', NOW() - INTERVAL '4 months') - INTERVAL '40 days'
    )
    SELECT
      to_char(date_trunc('month', time), 'Mon YYYY') AS month,
      date_trunc('month', time) AS month_date,
      SUM(GREATEST(mono_delta, 0))::int  as mono,
      SUM(GREATEST(color_delta, 0))::int as color
    FROM deltas
    WHERE time >= date_trunc('month', NOW() - INTERVAL '4 months')
    GROUP BY date_trunc('month', time)
    ORDER BY month_date ASC
  `,
    [id]
  );
  return result.rows as Array<{ month: string; month_date: Date; mono: number; color: number }>;
}

async function getClientDevices(db: Knex, request: FastifyRequest) {
  const { id } = request.params as { id: string };
  const { include } = request.query as { include?: string };
  const includeDecommissioned = include === "decommissioned" || include === "all";
  return await db("devices")
    .leftJoin("agents", "devices.agent_id", "agents.id")
    .where("devices.client_id", id)
    .modify((q) => {
      if (!includeDecommissioned) onlyLiveDevices(q, "devices");
      else notMerged(q, "devices");
    })
    .select(
      "devices.*",
      db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
      "agents.name as monitor_name",
      "agents.last_seen as monitor_last_seen"
    )
    .orderBy("devices.brand");
}

export function createClientReadHandlers(db: Knex) {
  return {
    listClients: (request: FastifyRequest) => listClients(db, request),
    getClient: (request: FastifyRequest) => getClient(db, request),
    getClientMonitors: (request: FastifyRequest) => getClientMonitors(db, request),
    getClientUsage: (request: FastifyRequest) => getClientUsage(db, request),
    getClientDevices: (request: FastifyRequest) => getClientDevices(db, request),
  };
}
