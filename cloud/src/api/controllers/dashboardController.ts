import { FastifyRequest } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";

export function createDashboardController(db: Knex, agentService: AgentService) {
  return {
    getDashboard: async () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);

      const [
        devicesCount,
        agentsStats,
        clientsCount,
        monthlyVolume,
        topClients,
        brandStats,
        offlineAgents,
        newDevicesCount,
      ] = await Promise.all([
        db("devices").where({ active: true }).count("* as c").first(),

        db("agents")
          .select(
            db.raw("COUNT(*)::int as total"),
            db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [fiveMinsAgo])
          )
          .first(),

        db("clients").count("* as c").first(),

        db
          .raw(
            `
          SELECT SUM(delta)::bigint as total FROM (
            SELECT (MAX(total_pages) - MIN(total_pages)) as delta
            FROM readings
            WHERE time >= date_trunc('month', now())
            GROUP BY device_id
          ) sub
        `
          )
          .then((r: any) => r.rows[0]),

        db("clients")
          .select("clients.name", "clients.id")
          .count("devices.id as device_count")
          .leftJoin("agents", "agents.client_id", "clients.id")
          .leftJoin("devices", "devices.agent_id", "agents.id")
          .groupBy("clients.id", "clients.name")
          .orderBy("device_count", "desc")
          .limit(5),

        db("devices")
          .where({ active: true })
          .select("brand")
          .count("* as count")
          .groupBy("brand")
          .orderBy("count", "desc")
          .limit(5),

        db("agents")
          .join("clients", "agents.client_id", "clients.id")
          .where((builder: Knex.QueryBuilder) => {
            builder
              .where("agents.last_seen", "<", fiveMinsAgo)
              .orWhereNull("agents.last_seen")
              .orWhere("agents.status", "offline");
          })
          .whereNot("agents.status", "revoked")
          .select(
            "agents.id",
            "agents.name",
            "clients.name as client_name",
            "agents.last_seen"
          )
          .orderBy("agents.last_seen", "desc")
          .limit(10),

        db("devices")
          .where({ active: true })
          .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .count("* as c")
          .first(),
      ]);

      const total = Number(devicesCount?.c || 0);
      const added = Number(newDevicesCount?.c || 0);
      const previousTotal = total - added;
      let deviceTrend: string | null = null;
      if (added > 0) {
        const pct = previousTotal > 0 ? Math.round((added / previousTotal) * 100) : 100;
        deviceTrend = `+${pct}% este mes`;
      }

      return {
        stats: {
          devices: total,
          agents: {
            total: agentsStats?.total || 0,
            online: agentsStats?.online || 0,
          },
          clients: Number(clientsCount?.c || 0),
          volume: Number(monthlyVolume?.total || 0),
          deviceTrend,
        },
        topClients: topClients.map((c: any) => ({ ...c, device_count: Number(c.device_count) })),
        brands: brandStats.map((b: any) => ({ ...b, count: Number(b.count) })),
        offlineAgents,
        systemHealth: {
          status: "healthy",
          uptime: process.uptime(),
          lastSync:
            brandStats.length > 0
              ? (await db("readings").orderBy("time", "desc").select("time").first())?.time
              : null,
        },
      };
    },

    globalSearch: async (request: FastifyRequest) => {
      const { q } = request.query as any;
      if (!q || q.length < 2) return { clients: [], devices: [] };
      return await agentService.globalSearch(q);
    },

    getAlerts: async (request: FastifyRequest) => {
      const { resolved } = request.query as any;
      const query = db("alerts")
        .join("devices", "alerts.device_id", "devices.id")
        .select(
          "alerts.*",
          "devices.brand",
          "devices.ip_address",
          "devices.name as device_name"
        )
        .orderBy("alerts.created_at", "desc")
        .limit(200);

      if (resolved === "true") {
        query.where("alerts.resolved", true);
      } else {
        query.where("alerts.resolved", false);
      }

      return await query;
    },
  };
}
