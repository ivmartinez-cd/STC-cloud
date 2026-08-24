import type { Knex } from "knex";
import type { IpRangeSpecInput } from "../ipRangeSpec";
import type { MaskedCredential } from "../snmpCredentials";
import { DEFAULT_BUSINESS_HOURS } from "../businessHours";
import { AgentLifecycleService } from "./lifecycle";
import { AgentConfigService } from "./config";
import { AgentDeviceRegistrationService } from "./device-registration";
import { AgentTelemetryService } from "./telemetry";
import { AgentCommandService } from "./commands";
import { AgentSearchService } from "./search";
import type {
  AgentConfigUpdate, AuditContext, IncomingDevice, IncomingLogEntry, IncomingReading,
  RedisClient, SystemInfoPayload,
} from "./types";

/**
 * Servicio central de lógica de negocio para la gestión de agentes DCA.
 * Encapsula operaciones de activación, sincronización de telemetría,
 * gestión de dispositivos y control de comandos remotos.
 *
 * Fachada delgada (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md): cada
 * grupo de responsabilidad vive en su propio sub-servicio (`./lifecycle`,
 * `./config`, `./device-registration`, `./telemetry`, `./commands`,
 * `./search`); esta clase sólo compone y delega — mismo método público, misma
 * firma, mismo comportamiento que la versión de un solo archivo (1592 líneas)
 * que reemplaza.
 *
 * @remarks
 * Todas las consultas a la base de datos utilizan Knex.js con parametrización
 * obligatoria para prevenir inyecciones SQL (ver SECURITY_AUDIT.md §3).
 */
export class AgentService {
  private readonly lifecycle: AgentLifecycleService;
  private readonly config: AgentConfigService;
  private readonly deviceRegistration: AgentDeviceRegistrationService;
  private readonly telemetry: AgentTelemetryService;
  private readonly commands: AgentCommandService;
  private readonly search: AgentSearchService;

  constructor(private db: Knex, private redis?: RedisClient) {
    this.lifecycle = new AgentLifecycleService(db);
    this.config = new AgentConfigService(db);
    this.deviceRegistration = new AgentDeviceRegistrationService(db);
    this.telemetry = new AgentTelemetryService(db, redis);
    this.commands = new AgentCommandService(db);
    this.search = new AgentSearchService(db);
  }

  // --- Lifecycle (activación, tokens, revocación) ---

  createActivationKey(
    clientId: string,
    name: string,
    config?: Pick<AgentConfigUpdate, 'ip_ranges' | 'snmp_community' | 'scan_interval_minutes' | 'business_hours'>,
    audit?: AuditContext
  ) {
    return this.lifecycle.createActivationKey(clientId, name, config, audit);
  }

  activateAgent(key: string, hardwareId: string) {
    return this.lifecycle.activateAgent(key, hardwareId);
  }

  refreshAgentToken(agentId: string, refreshToken: string) {
    return this.lifecycle.refreshAgentToken(agentId, refreshToken);
  }

  regenerateActivationKey(agentId: string, audit?: AuditContext) {
    return this.lifecycle.regenerateActivationKey(agentId, audit);
  }

  revokeToken(redis: RedisClient, agentId: string, ttlSeconds: number, requestIp?: string) {
    return this.lifecycle.revokeToken(redis, agentId, ttlSeconds, requestIp);
  }

  isBlacklisted(redis: RedisClient, agentId: string) {
    return this.lifecycle.isBlacklisted(redis, agentId);
  }

  // --- Configuración, ip_ranges, credenciales SNMP ---

  updateConfig(agentId: string, newConfig: AgentConfigUpdate, audit?: AuditContext) {
    return this.config.updateConfig(agentId, newConfig, audit);
  }

  getConfig(agentId: string) {
    return this.config.getConfig(agentId);
  }

  getIpRangeSpecsRaw(agentId: string): Promise<IpRangeSpecInput[] | null> {
    return this.config.getIpRangeSpecsRaw(agentId);
  }

  getSnmpCredentialsMasked(agentId: string): Promise<{ credentials: MaskedCredential[]; rev: number } | null> {
    return this.config.getSnmpCredentialsMasked(agentId);
  }

  replaceSnmpCredentials(agentId: string, body: unknown, audit?: AuditContext) {
    return this.config.replaceSnmpCredentials(agentId, body, audit);
  }

  // --- Registro de dispositivos ---

  registerDevices(agentId: string, devices: IncomingDevice[]) {
    return this.deviceRegistration.registerDevices(agentId, devices);
  }

  // --- Telemetría (lecturas, logs, heartbeat) ---

  ingestLogs(agentId: string, logs: IncomingLogEntry[], timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    return this.telemetry.ingestLogs(agentId, logs, timezone);
  }

  getLogs(agentId: string, limit: number = 50) {
    return this.telemetry.getLogs(agentId, limit);
  }

  heartbeat(agentId: string, systemInfo?: SystemInfoPayload) {
    return this.telemetry.heartbeat(agentId, systemInfo);
  }

  syncReadings(redis: RedisClient, readings: IncomingReading[], agentId: string, timezone: string = DEFAULT_BUSINESS_HOURS.timezone) {
    return this.telemetry.syncReadings(redis, readings, agentId, timezone);
  }

  // --- Comandos remotos ---

  addCommand(agentId: string, type: string, payload: Record<string, unknown> = {}, createdBy?: string) {
    return this.commands.addCommand(agentId, type, payload, createdBy);
  }

  getPendingCommands(agentId: string) {
    return this.commands.getPendingCommands(agentId);
  }

  updateCommandResult(commandId: string, status: string, result: Record<string, unknown> | null) {
    return this.commands.updateCommandResult(commandId, status, result);
  }

  // --- Búsqueda global ---

  globalSearch(query: string, clientId: string | null = null) {
    return this.search.globalSearch(query, clientId);
  }
}
