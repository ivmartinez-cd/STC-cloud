import type { Knex } from "knex";
import type { RedisClient } from "../domain/entities/agent";
import { AgentCommandsUseCase } from "../application/use-cases/command-use-cases";
import {
  GetAgentHeartbeatConfigUseCase, GetIpRangeSpecsRawUseCase, GetSnmpCredentialsMaskedUseCase, ReplaceSnmpCredentialsUseCase, UpdateAgentConfigUseCase,
} from "../application/use-cases/config-use-cases";
import { HeartbeatUseCase } from "../application/use-cases/heartbeat";
import {
  ActivateAgentUseCase, CreateActivationKeyUseCase, RefreshAgentTokenUseCase, RegenerateActivationKeyUseCase, RevokeTokenUseCase,
} from "../application/use-cases/lifecycle-use-cases";
import { AgentLogsUseCase } from "../application/use-cases/log-use-cases";
import {
  GetAgentActivityUseCase, GetAgentConnectivityUseCase, GetAgentLicenseUseCase, GetAgentStatsUseCase, ListAgentDeviceDirectoryUseCase,
} from "../application/use-cases/monitor-detail-use-cases";
import { DeleteAgentUseCase, GetAgentDetailUseCase, GetAgentDevicesUseCase, ListAgentsUseCase } from "../application/use-cases/portal-agent-use-cases";
import { ProcessReadingUseCase } from "../application/use-cases/process-reading";
import { RegisterDevicesFromAgentUseCase } from "../application/use-cases/register-devices";
import { EwsProxyUseCase, SendAgentCommandUseCase, SetRemoteEwsEnabledUseCase, TriggerScanUseCase } from "../application/use-cases/remote-use-cases";
import { GlobalSearchUseCase } from "../application/use-cases/search-use-case";
import { SyncReadingsUseCase } from "../application/use-cases/sync-readings";
import { AlertsModuleNotifier } from "../infrastructure/adapters/alerts-module-notifier";
import { DevicesModuleIdentityResolver, DevicesModuleMerger } from "../infrastructure/adapters/devices-module-adapters";
import { EwsProxyServiceGateway } from "../infrastructure/adapters/ews-proxy-service-gateway";
import { WsAgentLink } from "../infrastructure/adapters/ws-agent-link";
import { KnexAgentCommandRepository } from "../infrastructure/database/knex-agent-command-repository";
import { KnexAgentLogRepository } from "../infrastructure/database/knex-agent-log-repository";
import { KnexAgentPortalRepository } from "../infrastructure/database/knex-agent-portal-repository";
import { KnexAgentRepository } from "../infrastructure/database/knex-agent-repository";
import { KnexAuditLogWriter } from "../infrastructure/database/knex-audit-log-writer";
import { KnexGlobalSearchRepository } from "../infrastructure/database/knex-global-search-repository";
import { KnexIngestDeviceRepository } from "../infrastructure/database/knex-ingest-device-repository";
import { KnexAgentUnitOfWork, KnexIngestUnitOfWork } from "../infrastructure/database/knex-units-of-work";
import { BullmqIngestQueues } from "../infrastructure/queue/bullmq-ingest-queues";
import { RedisTokenBlacklist } from "../infrastructure/redis/redis-token-blacklist";

/** Composición de TODOS los casos de uso del módulo — un solo lugar para el cableado de adaptadores. */
export function buildAgentUseCases(db: Knex, redis?: RedisClient) {
  const agents = new KnexAgentRepository(db);
  const audit = new KnexAuditLogWriter(db);
  const ingestDevices = new KnexIngestDeviceRepository(db);
  const portal = new KnexAgentPortalRepository(db);
  const commands = new AgentCommandsUseCase(new KnexAgentCommandRepository(db));
  const logs = new AgentLogsUseCase(new KnexAgentLogRepository(db));
  const link = new WsAgentLink();
  const heartbeat = new HeartbeatUseCase(agents);
  const recordFailure = (agentId: string, message: string, timezone: string) => logs.recordSyncFailure(agentId, message, timezone);
  const processReading = new ProcessReadingUseCase(
    ingestDevices, new DevicesModuleIdentityResolver(db), new AlertsModuleNotifier(db), new DevicesModuleMerger(db), recordFailure
  );
  const maskedCredentials = new GetSnmpCredentialsMaskedUseCase(agents);
  return {
    createActivationKey: new CreateActivationKeyUseCase(agents, audit),
    activateAgent: new ActivateAgentUseCase(agents, audit),
    refreshAgentToken: new RefreshAgentTokenUseCase(agents),
    regenerateActivationKey: new RegenerateActivationKeyUseCase(agents, audit),
    revokeToken: (redisClient: RedisClient) => new RevokeTokenUseCase(agents, new RedisTokenBlacklist(redisClient), audit),
    blacklistFor: (redisClient: RedisClient) => new RedisTokenBlacklist(redisClient),
    updateConfig: new UpdateAgentConfigUseCase(agents, audit),
    heartbeatConfig: new GetAgentHeartbeatConfigUseCase(agents),
    ipRangeSpecsRaw: new GetIpRangeSpecsRawUseCase(agents),
    snmpCredentialsMasked: maskedCredentials,
    replaceSnmpCredentials: new ReplaceSnmpCredentialsUseCase(agents, audit),
    registerDevices: new RegisterDevicesFromAgentUseCase(agents, ingestDevices, new KnexIngestUnitOfWork(db)),
    logs,
    heartbeat,
    syncReadings: new SyncReadingsUseCase(agents, ingestDevices, processReading, new BullmqIngestQueues(redis), heartbeat, recordFailure),
    commands,
    globalSearch: new GlobalSearchUseCase(new KnexGlobalSearchRepository(db)),
    listAgents: new ListAgentsUseCase(portal),
    getAgentDetail: new GetAgentDetailUseCase(portal, (id) => maskedCredentials.execute(id)),
    getAgentDevices: new GetAgentDevicesUseCase(portal),
    getAgentStats: new GetAgentStatsUseCase(portal),
    getAgentConnectivity: new GetAgentConnectivityUseCase(portal),
    getAgentActivity: new GetAgentActivityUseCase(portal),
    getAgentLicense: new GetAgentLicenseUseCase(portal),
    listAgentDeviceDirectory: new ListAgentDeviceDirectoryUseCase(portal),
    deleteAgent: new DeleteAgentUseCase(new KnexAgentUnitOfWork(db)),
    sendCommand: new SendAgentCommandUseCase(commands, link, audit),
    triggerScan: new TriggerScanUseCase(commands, link),
    setRemoteEws: new SetRemoteEwsEnabledUseCase(portal, audit),
    ewsProxy: new EwsProxyUseCase(portal, commands, link, new EwsProxyServiceGateway(), audit),
    link,
  };
}

export type AgentUseCases = ReturnType<typeof buildAgentUseCases>;
