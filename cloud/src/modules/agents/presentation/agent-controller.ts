import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getClientIp } from "../../../api/utils/ip";
import type { IncomingDevice, IncomingLogEntry, IncomingReading, RedisClient, SystemInfoPayload } from "../domain/entities/agent";
import type { AgentService } from "../index";

/** Endpoints que consume el AGENTE DCA (autenticados por `agentAuth`). */

interface AgentIdParams { id: string }
interface AgentJwtUser { agentId: string }
interface CommandResult { id: string; status: string; result: Record<string, unknown> | null }
interface HeartbeatBody { logs?: IncomingLogEntry[]; commandResults?: CommandResult[]; system_info?: SystemInfoPayload }

const timezoneOf = (request: FastifyRequest) => (request as FastifyRequest & { agentTimezone?: string }).agentTimezone;

export function createAgentController(fastify: FastifyInstance, redis: RedisClient, agentService: AgentService) {
  return {
    getCommands: async (request: FastifyRequest) => agentService.getPendingCommands((request.params as AgentIdParams).id),

    heartbeat: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { logs, commandResults, system_info } = request.body as HeartbeatBody;
      await agentService.heartbeat(id, system_info, getClientIp(request));
      if (logs && Array.isArray(logs)) await agentService.ingestLogs(id, logs, timezoneOf(request));
      if (commandResults && Array.isArray(commandResults)) {
        for (const res of commandResults) {
          await agentService.updateCommandResult(res.id, res.status, res.result);
          fastify.log.info({ agentId: id, commandId: res.id }, "[WSS] Reenviando resultado de comando al portal");
          agentService.broadcastCommandResult(id, res.id, res.status, res.result);
        }
      }
      const [config, commands] = await Promise.all([agentService.getConfig(id), agentService.getPendingCommands(id)]);
      return { status: "received", config, commands };
    },

    syncDevices: async (request: FastifyRequest, reply: FastifyReply) => {
      const { readings } = request.body as { readings: IncomingReading[] };
      const { agentId } = request.user as AgentJwtUser;
      try {
        const result = await agentService.syncReadings(redis, readings, agentId, timezoneOf(request));
        return { status: "success", count: readings.length, ...result };
      } catch (e: unknown) {
        return reply.status(500).send({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    registerDevices: async (request: FastifyRequest) => {
      const { devices } = request.body as { devices: IncomingDevice[] };
      await agentService.registerDevices((request.user as AgentJwtUser).agentId, devices);
      return { status: "success" };
    },
  };
}
