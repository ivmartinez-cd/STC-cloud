import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Redis from "ioredis";
import { AgentService, IncomingLogEntry, IncomingReading, IncomingDevice, SystemInfoPayload } from "../../services/agentService";
import { broadcastToPortal } from "../../ws/index";

/** Parámetros de ruta con ID de agente. */
interface AgentIdParams { id: string; }

/** Payload JWT decodificado del agente. */
interface AgentJwtUser { agentId: string; }

/** Resultado de un comando remoto reportado por el agente. */
interface CommandResult {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
}

/** Cuerpo del heartbeat enviado por el agente DCA. */
interface HeartbeatBody {
  logs?: IncomingLogEntry[];
  commandResults?: CommandResult[];
  system_info?: SystemInfoPayload;
}

/** Cuerpo del sync de dispositivos. */
interface SyncBody { readings: IncomingReading[]; }

/** Cuerpo del registro de dispositivos. */
interface RegisterBody { devices: IncomingDevice[]; }

export function createAgentController(
  fastify: FastifyInstance,
  redis: Redis,
  agentService: AgentService
) {
  return {
    getCommands: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      return await agentService.getPendingCommands(id);
    },

    heartbeat: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { logs, commandResults, system_info } = request.body as HeartbeatBody;

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
      const { readings } = request.body as SyncBody;
      const { agentId } = request.user as AgentJwtUser;
      try {
        await agentService.syncReadings(redis, readings, agentId);
        return { status: "success", count: readings.length };
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        return reply.status(500).send({ error: errMsg });
      }
    },

    registerDevices: async (request: FastifyRequest) => {
      const { devices } = request.body as RegisterBody;
      const { agentId } = request.user as AgentJwtUser;
      await agentService.registerDevices(agentId, devices);
      return { status: "success" };
    },
  };
}
