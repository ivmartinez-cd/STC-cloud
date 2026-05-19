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
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "clients.name as client_name"
        )
        .orderBy("clients.name"),

    getDevice: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as any;
      const device = await db("devices")
        .where("devices.id", id)
        .select(
          "devices.*",
          db.raw("CASE WHEN devices.active = true THEN 'online' ELSE 'offline' END as status"),
          "agents.name as monitor_name",
          "agents.status as agent_status",
          "agents.last_seen as agent_last_seen",
          "clients.name as client_name"
        )
        .join("agents", "agents.id", "devices.agent_id")
        .join("clients", "clients.id", "agents.client_id")
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado" });
      return device;
    },

    getDeviceReadings: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const { from, to, limit } = request.query as any;

      const query = db("readings")
        .where({ device_id: id })
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
  };
}
