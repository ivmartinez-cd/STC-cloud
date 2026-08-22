import { FastifyRequest } from "fastify";
import { Knex } from "knex";
import { AgentService } from "../../services/agentService";
import { agentIdsOf, deviceIdsOf, getScope } from "../utils/scope";

export function createDashboardController(db: Knex, agentService: AgentService) {
  return {
    getDashboard: async (request: FastifyRequest) => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const scope = getScope(request);
      const cid = scope.kind === "client" ? scope.id : null;

      const [
        devicesCount,
        agentsStats,
        clientsCount,
        monthlyVolume,
        topClients,
        brandStats,
        offlineAgents,
        newDevicesCount,
        readings24hCount,
        lastReadingInfo,
        clientsWithAlertsCount,
      ] = await Promise.all([
        db("devices")
          .where({ active: true })
          .modify((q) => { if (cid) q.whereIn("agent_id", agentIdsOf(db, cid)); })
          .count("* as c")
          .first(),

        db("agents")
          .modify((q) => { if (cid) q.where("client_id", cid); })
          .select(
            db.raw("COUNT(*)::int as total"),
            db.raw("COUNT(CASE WHEN last_seen >= ? THEN 1 END)::int as online", [fiveMinsAgo])
          )
          .first(),

        db("clients")
          .modify((q) => { if (cid) q.where("id", cid); })
          .count("* as c")
          .first(),

        // Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del período):
        // un reset/decremento de contador dentro del mes no debe inflar el volumen.
        // La ventana interna se extiende 40 días atrás para que la primera lectura
        // del mes tenga como base la última lectura del mes anterior. El filtro por
        // cliente va DENTRO del subselect con ventana (no afuera, sobre `sub`): así el
        // LAG de cada dispositivo sigue viendo su propia lectura previa aunque se
        // filtre por cliente.
        db
          .raw(
            `
          SELECT SUM(GREATEST(delta, 0))::bigint as total FROM (
            SELECT
              r.time,
              r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) as delta
            FROM readings r
            ${cid ? "JOIN devices d ON d.id = r.device_id JOIN agents a ON a.id = d.agent_id" : ""}
            WHERE r.time >= date_trunc('month', now()) - INTERVAL '40 days'
            ${cid ? "AND a.client_id = ?" : ""}
          ) sub
          WHERE delta IS NOT NULL AND time >= date_trunc('month', now())
        `,
            cid ? [cid] : []
          )
          .then((r: { rows: Array<{ total: string | null }> }) => r.rows[0]),

        db("clients")
          .select("clients.name", "clients.id")
          .count("devices.id as device_count")
          .leftJoin("agents", "agents.client_id", "clients.id")
          .leftJoin("devices", "devices.agent_id", "agents.id")
          .modify((q) => { if (cid) q.where("clients.id", cid); })
          .groupBy("clients.id", "clients.name")
          .orderBy("device_count", "desc")
          .limit(5),

        db("devices")
          .where({ active: true })
          .modify((q) => { if (cid) q.whereIn("devices.agent_id", agentIdsOf(db, cid)); })
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
          .modify((q) => { if (cid) q.andWhere("agents.client_id", cid); })
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
          .modify((q) => { if (cid) q.whereIn("agent_id", agentIdsOf(db, cid)); })
          .count("* as c")
          .first(),

        db("readings")
          .where("time", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000))
          .modify((q) => { if (cid) q.whereIn("device_id", deviceIdsOf(db, cid)); })
          .count("* as c")
          .first(),

        db("readings")
          .join("devices", "readings.device_id", "devices.id")
          .join("agents", "devices.agent_id", "agents.id")
          .join("clients", "agents.client_id", "clients.id")
          .modify((q) => { if (cid) q.where("agents.client_id", cid); })
          .orderBy("readings.time", "desc")
          .select("readings.time", "clients.name as client_name")
          .first(),

        db("alerts")
          .join("devices", "alerts.device_id", "devices.id")
          .join("agents", "devices.agent_id", "agents.id")
          .where("alerts.resolved", false)
          .modify((q) => { if (cid) q.andWhere("agents.client_id", cid); })
          .countDistinct("agents.client_id as c")
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
        topClients: (topClients as Array<{ name: string; id: string; device_count: string | number }>).map((c) => ({ ...c, device_count: Number(c.device_count) })),
        brands: (brandStats as Array<{ brand: string; count: string | number }>).map((b) => ({ ...b, count: Number(b.count) })),
        offlineAgents,
        systemHealth: {
          status: "healthy",
          uptime: process.uptime(),
          lastSync: lastReadingInfo?.time ?? null,
          lastClient: lastReadingInfo?.client_name ?? null,
          readingsCount24h: Number(readings24hCount?.c || 0),
          clientsWithAlertsCount: Number(clientsWithAlertsCount?.c || 0),
        },
      };
    },

    globalSearch: async (request: FastifyRequest) => {
      const { q } = request.query as { q?: string };
      if (!q || q.length < 2) return { clients: [], devices: [] };
      const scope = getScope(request);
      return await agentService.globalSearch(q, scope.kind === "client" ? scope.id : null);
    },

    getAlerts: async (request: FastifyRequest) => {
      const { resolved, device_id } = request.query as { resolved?: string; device_id?: string };
      const scope = getScope(request);
      const query = db("alerts")
        .join("devices", "alerts.device_id", "devices.id")
        .leftJoin("agents", "devices.agent_id", "agents.id")
        .leftJoin("clients", "agents.client_id", "clients.id")
        .modify((q) => {
          // Convierte los leftJoin en inner de hecho para un viewer: una alerta de un
          // equipo con `agent_id` NULL (huérfano) no pertenece a ningún cliente, así
          // que no debe verla nadie scopeado.
          if (scope.kind === "client") q.where("agents.client_id", scope.id);
        })
        .select(
          "alerts.id",
          "alerts.device_id",
          "alerts.type",
          "alerts.severity",
          "alerts.message",
          "alerts.value",
          "alerts.resolved",
          "alerts.created_at",
          "devices.brand",
          "devices.ip_address",
          "devices.name as device_name",
          "devices.serial_number as serial",
          "agents.name as agent_name",
          "clients.name as client_name"
        )
        .orderBy("alerts.created_at", "desc")
        .limit(200);

      if (device_id) {
        query.where("alerts.device_id", device_id);
      }

      if (resolved === "true") {
        query.where("alerts.resolved", true);
      } else if (resolved === "false") {
        query.where("alerts.resolved", false);
      }

      return await query;
    },
  };
}
