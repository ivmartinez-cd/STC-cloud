import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { broadcastToPortal } from "../../ws/index";

export function createAgentController(
  fastify: FastifyInstance,
  redis: Redis,
  agentService: AgentService
) {
  return {
    getCommands: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      return await agentService.getPendingCommands(id);
    },

    heartbeat: async (request: FastifyRequest) => {
      const { id } = request.params as any;
      const { logs, commandResults, system_info } = request.body as any;

      await agentService.heartbeat(id, system_info);

      if (logs && Array.isArray(logs)) {
        await agentService.ingestLogs(id, logs);
      }

      if (commandResults && Array.isArray(commandResults)) {
        for (const res of commandResults) {
          await agentService.updateCommandResult(res.id, res.status, res.result);
          fastify.log.info(
            { agentId: id, commandId: res.id },
            `[WSS] Reenviando resultado de comando al portal`
          );
          broadcastToPortal("command_result", {
            agentId: id,
            commandId: res.id,
            status: res.status,
            result: res.result,
          });
        }
      }

      const [config, commands] = await Promise.all([
        agentService.getConfig(id),
        agentService.getPendingCommands(id),
      ]);

      return { status: "received", config, commands };
    },

    syncDevices: async (request: FastifyRequest, reply: FastifyReply) => {
      const { readings } = request.body as any;
      const { agentId } = request.user as any;
      try {
        await agentService.syncReadings(redis, readings, agentId);
        return { status: "success", count: readings.length };
      } catch (e: any) {
        return reply.status(500).send({ error: e.message });
      }
    },

    registerDevices: async (request: FastifyRequest) => {
      const { devices } = request.body as any;
      const { agentId } = request.user as any;
      await agentService.registerDevices(agentId, devices);
      return { status: "success" };
    },
  };
}
