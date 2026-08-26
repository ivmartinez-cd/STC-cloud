import type { Knex } from "knex";
import { DEFAULT_BUSINESS_HOURS } from "../../shared/domain/business-hours";
import type { IpRangeSpecInput } from "../../shared/domain/ip-range-spec";
import type { MaskedCredential } from "../../services/snmpCredentials";
import type {
  AgentConfigUpdate, AuditContext, IncomingDevice, IncomingLogEntry, IncomingReading, RedisClient, SystemInfoPayload,
} from "./domain/entities/agent";
import { AgentCommandsUseCase } from "./application/use-cases/command-use-cases";
import { KnexAgentCommandRepository } from "./infrastructure/database/knex-agent-command-repository";
import { buildAgentUseCases, type AgentUseCases } from "./presentation/agent-wiring";

export type { AuditContext, AgentConfigUpdate, IncomingDevice, IncomingLogEntry, IncomingReading, SystemInfoPayload, RedisClient } from "./domain/entities/agent";

/**
 * Fachada del módulo — la clase `AgentService` que `server.ts` construye una
 * vez (`new AgentService(db, redis)`) e inyecta en `authMiddleware`,
 * `authController`, `ws/`, el dashboard y las rutas. Mismo constructor, mismos
 * métodos públicos y mismas firmas que la versión de `services/agentService/`;
 * cada método delega en su caso de uso (`useCases`, expuesto para la
 * presentación de este mismo módulo).
 */
export class AgentService {
  readonly useCases: AgentUseCases;

  constructor(db: Knex, redis?: RedisClient) {
    this.useCases = buildAgentUseCases(db, redis);
  }

  // --- Lifecycle (activación, tokens, revocación) ---
  createActivationKey(clientId: string, name: string, config?: Pick<AgentConfigUpdate, "ip_ranges" | "snmp_community" | "scan_interval_minutes" | "business_hours">, audit?: AuditContext) {
    return this.useCases.createActivationKey.execute({ clientId, name, config, audit });
  }
  activateAgent(key: string, hardwareId: string) { return this.useCases.activateAgent.execute(key, hardwareId); }
  refreshAgentToken(agentId: string, refreshToken: string) { return this.useCases.refreshAgentToken.execute(agentId, refreshToken); }
  regenerateActivationKey(agentId: string, audit?: AuditContext) { return this.useCases.regenerateActivationKey.execute(agentId, audit); }
  revokeToken(redis: RedisClient, agentId: string, ttlSeconds: number, requestIp?: string) {
    return this.useCases.revokeToken(redis).execute(agentId, ttlSeconds, requestIp);
  }
  isBlacklisted(redis: RedisClient, agentId: string) { return this.useCases.blacklistFor(redis).has(agentId); }

  // --- Configuración, ip_ranges, credenciales SNMP ---
  updateConfig(agentId: string, newConfig: AgentConfigUpdate, audit?: AuditContext) { return this.useCases.updateConfig.execute(agentId, newConfig, audit); }
  /** Config del HEARTBEAT (credenciales descifradas) — nunca devolver al portal tal cual. */
  getConfig(agentId: string) { return this.useCases.heartbeatConfig.execute(agentId); }
  getIpRangeSpecsRaw(agentId: string): Promise<IpRangeSpecInput[] | null> { return this.useCases.ipRangeSpecsRaw.execute(agentId); }
  getSnmpCredentialsMasked(agentId: string): Promise<{ credentials: MaskedCredential[]; rev: number } | null> { return this.useCases.snmpCredentialsMasked.execute(agentId); }
  replaceSnmpCredentials(agentId: string, body: unknown, audit?: AuditContext) { return this.useCases.replaceSnmpCredentials.execute(agentId, body, audit); }

  // --- Registro de dispositivos ---
  registerDevices(agentId: string, devices: IncomingDevice[]) { return this.useCases.registerDevices.execute(agentId, devices); }

  // --- Telemetría (lecturas, logs, heartbeat) ---
  ingestLogs(agentId: string, logs: IncomingLogEntry[], timezone: string = DEFAULT_BUSINESS_HOURS.timezone) { return this.useCases.logs.ingest(agentId, logs, timezone); }
  getLogs(agentId: string, limit = 50) { return this.useCases.logs.list(agentId, limit); }
  heartbeat(agentId: string, systemInfo?: SystemInfoPayload, ipAddress?: string) { return this.useCases.heartbeat.execute(agentId, systemInfo, ipAddress); }
  /** `redis` es un parámetro muerto pre-existente (se usa la conexión del constructor) — firma conservada. */
  syncReadings(_redis: RedisClient, readings: IncomingReading[], agentId: string, timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    return this.useCases.syncReadings.execute(readings, agentId, timezone);
  }

  // --- Comandos remotos ---
  addCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) { return this.useCases.commands.add(agentId, type, payload, createdBy); }
  getPendingCommands(agentId: string) { return this.useCases.commands.takePending(agentId); }
  updateCommandResult(commandId: string, status: string, result: Record<string, unknown> | null) { return this.useCases.commands.updateResult(commandId, status, result); }
  /** Reenvío del resultado de un comando al portal (WSS). */
  broadcastCommandResult(agentId: string, commandId: string, status: string, result: unknown) {
    this.useCases.link.broadcastToPortal("command_result", { agentId, commandId, status, result });
  }

  // --- Búsqueda global ---
  globalSearch(query: string, clientId: string | null = null) { return this.useCases.globalSearch.execute(query, clientId); }
}

/** Cola de comandos sin la fachada completa — la usa `jobs/remoteActionWorker.ts` (módulo remote-actions). */
export class AgentCommandService {
  private readonly commands: AgentCommandsUseCase;
  constructor(db: Knex) { this.commands = new AgentCommandsUseCase(new KnexAgentCommandRepository(db)); }
  addCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) { return this.commands.add(agentId, type, payload, createdBy); }
  getPendingCommands(agentId: string) { return this.commands.takePending(agentId); }
  updateCommandResult(commandId: string, status: string, result: Record<string, unknown> | null) { return this.commands.updateResult(commandId, status, result); }
}
