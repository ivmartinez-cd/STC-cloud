import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";

export function createDeviceController(db: Knex) {
  return {
    listDevices: async () =>
      await db("devices")
        .join("agents", "devices.agent_id", "agents.id")
        .join("clients", "agents.client_id", "clients.id")
        .where("devices.active", true)
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
        .orderBy("clients.name"),

    getDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

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

    getDeviceReadings: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const { from, to, limit } = request.query as { from?: string; to?: string; limit?: string };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let targetId = id;
      if (!isUuid) {
        const found = await db("devices")
          .where(function() {
            this.whereRaw("devices.id::text LIKE ?", [`${id}%`])
                .orWhere("devices.serial_number", id)
                .orWhereRaw("devices.ip_address::text = ?", [id]);
          })
          .select("id")
          .first();
        if (found) targetId = found.id;
      }

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
          await trx("monthly_counters").where("device_id", id).del();
          const deleted = await trx("devices").where("id", id).del();
          if (!deleted) {
            throw new Error("Dispositivo no encontrado");
          }
        });
        return { success: true, message: "Dispositivo eliminado correctamente" };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.status(404).send({ error: msg });
      }
    },

    deleteOfflineDevices: async (request: FastifyRequest) => {
      const { agent_id } = request.query as { agent_id?: string };
      const offlineCutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min sin lecturas

      const targetDevices = await db("devices")
        .where(function() {
          this.where("last_seen", "<", offlineCutoff)
            .orWhereNull("last_seen")
            .orWhere("active", false);
        })
        .modify((qb) => {
          if (agent_id) qb.andWhere({ agent_id });
        })
        .select("id");

      const targetIds = targetDevices.map((d: { id: string }) => d.id);
      if (targetIds.length === 0) {
        return { success: true, count: 0, message: "No hay dispositivos desconectados para eliminar" };
      }

      await db.transaction(async (trx) => {
        await trx("readings").whereIn("device_id", targetIds).del();
        await trx("alerts").whereIn("device_id", targetIds).del();
        await trx("monthly_counters").whereIn("device_id", targetIds).del();
        await trx("devices").whereIn("id", targetIds).del();
      });

      return { success: true, count: targetIds.length, message: `${targetIds.length} dispositivo(s) desconectado(s) eliminado(s)` };
    },
  };
}
