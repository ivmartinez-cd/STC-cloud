import { FastifyRequest } from "fastify";
import { Knex } from "knex";

export function createClientController(db: Knex) {
  return {
    createClient: async (request: FastifyRequest) => {
      const data = request.body as any;
      const [client] = await db("clients").insert(data).returning("*");
      return client;
    },

    listClients: async () =>
      await db("clients")
        .select(
          "clients.*",
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"
          ),
          db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count"),
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"
          )
        )
        .leftJoin("agents as a", "a.client_id", "clients.id")
        .leftJoin("devices as d", "d.agent_id", "a.id")
        .groupBy("clients.id")
        .orderBy("clients.name"),

    getClient: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await db("clients")
        .where("clients.id", id)
        .select(
          "clients.*",
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"
          ),
          db.raw("COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count"),
          db.raw(
            "COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"
          )
        )
        .leftJoin("agents as a", "a.client_id", "clients.id")
        .leftJoin("devices as d", "d.agent_id", "a.id")
        .groupBy("clients.id")
        .first();
    },

    getClientMonitors: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await db("agents")
        .where("agents.client_id", id)
        .select(
          "agents.id",
          "agents.name",
          "agents.status",
          "agents.last_seen",
          "agents.hardware_id",
          "agents.host_name",
          "agents.ip_ranges",
          "agents.scan_interval_minutes",
          db.raw(
            "COUNT(DISTINCT CASE WHEN d.active = true THEN d.id END)::int AS device_count"
          )
        )
        .leftJoin("devices as d", "d.agent_id", "agents.id")
        .groupBy("agents.id")
        .orderBy("agents.name");
    },

    getClientUsage: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const result = await db.raw(
        `
        SELECT
          to_char(month_date, 'Mon YYYY') AS month,
          month_date,
          SUM(max_mono - min_mono)::int as mono,
          SUM(max_color - min_color)::int as color
        FROM (
          SELECT
            date_trunc('month', r.time) as month_date,
            r.device_id,
            MAX(r.mono_pages) as max_mono,
            MIN(r.mono_pages) as min_mono,
            MAX(r.color_pages) as max_color,
            MIN(r.color_pages) as min_color
          FROM readings r
          JOIN devices d ON r.device_id = d.id
          JOIN agents  a ON d.agent_id = a.id
          WHERE a.client_id = ?
            AND r.time >= date_trunc('month', NOW() - INTERVAL '4 months')
          GROUP BY date_trunc('month', r.time), r.device_id
        ) sub
        GROUP BY month_date
        ORDER BY month_date ASC
      `,
        [id]
      );
      return result.rows;
    },

    getClientDevices: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await db("devices")
        .join("agents", "devices.agent_id", "agents.id")
        .where("agents.client_id", id)
        .select(
          "devices.*",
          db.raw(
            "CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"
          ),
          "agents.name as monitor_name",
          "agents.last_seen as monitor_last_seen"
        )
        .orderBy("devices.brand");
    },
  };
}
