import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import { getScope } from "../utils/scope";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDeviceController(db: Knex) {
  return {
    listDevices: async (request: FastifyRequest) => {
      const scope = getScope(request);
      return await db("devices")
        .join("agents", "devices.agent_id", "agents.id")
        .join("clients", "agents.client_id", "clients.id")
        .where("devices.active", true)
        .modify((q) => {
          if (scope.kind === "client") q.andWhere("agents.client_id", scope.id);
        })
        .select(
          "devices.*",
          db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
          "agents.id as agent_id",
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "agents.client_id as client_id",
          "clients.name as client_name"
        )
        .orderBy("clients.name");
    },

    getDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const scope = getScope(request);
      const isUuid = UUID_RE.test(id);

      const device = await db("devices")
        .where(function() {
          if (isUuid) {
            this.where("devices.id", id);
          } else {
            this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
                .orWhere("devices.serial_number", id)
                .orWhereRaw("devices.ip_address::text = ?", [id]);
          }
        })
        .modify((q) => {
          // El `.where(function(){...})` de arriba genera un grupo con paréntesis
          // reales, así que este `andWhere` queda al nivel superior — no lo anula la
          // precedencia de los `orWhere` internos (a diferencia del bug de
          // `globalSearch`, donde el OR no estaba agrupado).
          if (scope.kind === "client") q.andWhere("agents.client_id", scope.id);
        })
        .select(
          "devices.*",
          db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
          "agents.id as agent_id",
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "agents.client_id as client_id",
          "clients.name as client_name"
        )
        .join("agents", "agents.id", "devices.agent_id")
        .join("clients", "clients.id", "agents.client_id")
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      return device;
    },

    getDeviceReadings: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { from, to, limit } = request.query as { from?: string; to?: string; limit?: string };
      const scope = getScope(request);
      const isUuid = UUID_RE.test(id);

      // Resolución de alias (prefijo/serial/IP) y ownership se hacen en UNA sola query,
      // ANTES de tocar `readings`: antes, un `:id` no-UUID que no resolvía a ningún
      // dispositivo se pasaba tal cual a `where({device_id: id})`, y Postgres lo
      // rechazaba con `22P02 invalid input syntax for type uuid` → 500. Ahora, si no
      // hay fila (no existe, o existe pero es de otro cliente), es un 404 — nunca se
      // llega a construir la query de `readings` con un id sin resolver, y nunca se
      // le agrega un join a esa query (hace `select("*")`: un join cambiaría la forma
      // de la respuesta agregando columnas de `agents`).
      const owned = await db("devices")
        .leftJoin("agents", "agents.id", "devices.agent_id")
        .where(function () {
          if (isUuid) {
            this.where("devices.id", id);
          } else {
            this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
                .orWhere("devices.serial_number", id)
                .orWhereRaw("devices.ip_address::text = ?", [id]);
          }
        })
        .modify((q) => {
          if (scope.kind === "client") q.andWhere("agents.client_id", scope.id);
        })
        .select("devices.id")
        .first();
      if (!owned) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      const targetId = owned.id;

      const query = db("readings")
        .where({ device_id: targetId })
        .whereNotNull("total_pages")
        .where("total_pages", ">", 0)
        .orderBy("time", "desc")
        .limit(Math.min(Number(limit) || 500, 5000));

      if (from) query.where("time", ">=", new Date(from));
      if (to) query.where("time", "<=", new Date(to));

      return await query.select(
        "*",
        db.raw(
          "CASE WHEN offline = true THEN 'offline' ELSE 'online' END as status"
        )
      );
    },

    deleteDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await db.transaction(async (trx) => {
          await trx("readings").where("device_id", id).del();
          await trx("alerts").where("device_id", id).del();
          if (await trx.schema.hasTable("monthly_counters")) {
            await trx("monthly_counters").where("device_id", id).del();
          }
          const deleted = await trx("devices").where("id", id).del();
          if (!deleted) {
            throw new Error("Dispositivo no encontrado");
          }
        });

        const user = (request as FastifyRequest & { user: PortalUser }).user;
        await db("audit_logs").insert({
          action: "DEVICE_DELETED",
          target_id: id,
          user_id: user?.userId ?? null,
          ip_address: getClientIp(request),
          metadata: JSON.stringify({}),
        });

        return { success: true, message: "Dispositivo eliminado correctamente" };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(404).send({ error: msg });
      }
    },

    deleteOfflineDevices: async (request: FastifyRequest, reply: FastifyReply) => {
      const { agent_id } = request.query as { agent_id?: string };
      if (!agent_id) {
        return reply.status(400).send({ error: "agent_id es requerido" });
      }
      const offlineCutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min sin lecturas

      const targetDevices = await db("devices")
        .where(function() {
          this.where("last_seen", "<", offlineCutoff)
            .orWhereNull("last_seen")
            .orWhere("active", false);
        })
        .andWhere({ agent_id })
        .select("id");

      const targetIds = targetDevices.map((d: { id: string }) => d.id);
      if (targetIds.length === 0) {
        return { success: true, count: 0, message: "No hay dispositivos desconectados para eliminar" };
      }

      await db.transaction(async (trx) => {
        await trx("readings").whereIn("device_id", targetIds).del();
        await trx("alerts").whereIn("device_id", targetIds).del();
        if (await trx.schema.hasTable("monthly_counters")) {
          await trx("monthly_counters").whereIn("device_id", targetIds).del();
        }
        await trx("devices").whereIn("id", targetIds).del();
      });

      const user = (request as FastifyRequest & { user: PortalUser }).user;
      await db("audit_logs").insert({
        action: "DEVICES_OFFLINE_PURGED",
        target_id: agent_id,
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ count: targetIds.length }),
      });

      return { success: true, count: targetIds.length, message: `${targetIds.length} dispositivo(s) desconectado(s) eliminado(s)` };
    },
  };
}
