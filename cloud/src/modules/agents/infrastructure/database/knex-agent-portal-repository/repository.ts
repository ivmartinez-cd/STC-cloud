import type { Knex } from "knex";
import type { AgentScope } from "../../../domain/entities/agent";
import type {
  AgentActivityEvent, AgentDeviceDirectoryQuery, AgentDeviceDirectoryRow, AgentLicense, AgentStats, ConnectivityDay,
} from "../../../domain/entities/monitor-detail";
import type { AgentDeleteSnapshot, AgentPortalRepository } from "../../../domain/repositories/agent-portal-repository";
import { listAgents, getAgentDetail } from "./list-detail";
import { listAgentDevices } from "./devices";
import { agentSnapshotForDelete, agentDeviceIdsOf, agentAnyClosureLines, agentDeleteCascade } from "./delete";
import { findAgentForEws, findDeviceForEws, updateRemoteEwsEnabled } from "./ews";
import { listAgentDevicesDirectory } from "./device-directory";
import { getAgentConnectivity30d, getAgentStats } from "./stats";
import { getAgentRecentActivity } from "./activity";
import { getAgentLicense } from "./license";

export class KnexAgentPortalRepository implements AgentPortalRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  list(scope: AgentScope): Promise<unknown[]> {
    return listAgents(this.db, scope);
  }

  getDetail(id: string, full: boolean): Promise<Record<string, any> | null> {
    return getAgentDetail(this.db, id, full);
  }

  listDevices(agentId: string, includeDecommissioned: boolean): Promise<unknown[]> {
    return listAgentDevices(this.db, agentId, includeDecommissioned);
  }

  snapshotForDelete(id: string): Promise<AgentDeleteSnapshot | null> {
    return agentSnapshotForDelete(this.db, id);
  }

  deviceIdsOf(agentId: string): Promise<string[]> {
    return agentDeviceIdsOf(this.db, agentId);
  }

  anyClosureLines(deviceIds: string[]): Promise<boolean> {
    return agentAnyClosureLines(this.db, deviceIds);
  }

  deleteCascade(agentId: string, deviceIds: string[]): Promise<void> {
    return agentDeleteCascade(this.db, agentId, deviceIds);
  }

  findEwsAgent(id: string) {
    return findAgentForEws(this.db, id);
  }

  findEwsDevice(agentId: string, deviceId: string) {
    return findDeviceForEws(this.db, agentId, deviceId);
  }

  setRemoteEwsEnabled(id: string, enabled: boolean): Promise<number> {
    return updateRemoteEwsEnabled(this.db, id, enabled);
  }

  listDevicesDirectory(query: AgentDeviceDirectoryQuery): Promise<{ items: AgentDeviceDirectoryRow[]; total: number }> {
    return listAgentDevicesDirectory(this.db, query);
  }

  getConnectivity30d(agentId: string): Promise<ConnectivityDay[]> {
    return getAgentConnectivity30d(this.db, agentId);
  }

  getStats(agentId: string): Promise<AgentStats> {
    return getAgentStats(this.db, agentId);
  }

  getRecentActivity(agentId: string, limit: number): Promise<AgentActivityEvent[]> {
    return getAgentRecentActivity(this.db, agentId, limit);
  }

  getLicense(agentId: string): Promise<AgentLicense | null> {
    return getAgentLicense(this.db, agentId);
  }
}
