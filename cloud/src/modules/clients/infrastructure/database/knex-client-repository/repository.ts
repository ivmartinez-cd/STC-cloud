import type { Knex } from "knex";
import type {
  ClientDetailStats, ClientDeviceDirectoryQuery, ClientDeviceDirectoryRow, ClientDeviceRow, ClientDirectoryRow,
  ClientMonitorRow, ClientPortfolioSummary, ClientRecord, ClientUsageMonth,
} from "../../../domain/entities/client";
import type { ClientDirectoryQuery, ClientRepository, ClientScope } from "../../../domain/repositories/client-repository";
import type { StoredSftpDestination } from "../../../../../shared/domain/sftp-destination";
import { existsClient, insertClient, updateClient, listClientsWithCounts, findClientWithCounts } from "./crud";
import { listClientDirectory, getClientPortfolioSummary } from "./directory";
import { listClientMonitors, usageByMonth } from "./monitors-usage";
import { listClientDevicesDirectory, listClientDevices } from "./device-directory";
import { getClientStats } from "./stats";
import { findSftpDestinationRaw, updateSftpDestination } from "./sftp-destination";

export class KnexClientRepository implements ClientRepository {
  constructor(private readonly db: Knex) {}

  exists(id: string): Promise<boolean> {
    return existsClient(this.db, id);
  }

  insert(data: Record<string, unknown>): Promise<ClientRecord> {
    return insertClient(this.db, data);
  }

  update(id: string, updates: Record<string, unknown>): Promise<ClientRecord> {
    return updateClient(this.db, id, updates);
  }

  listWithCounts(scope: ClientScope): Promise<ClientRecord[]> {
    return listClientsWithCounts(this.db, scope);
  }

  findWithCounts(id: string): Promise<ClientRecord | null> {
    return findClientWithCounts(this.db, id);
  }

  listDirectory(query: ClientDirectoryQuery): Promise<{ items: ClientDirectoryRow[]; total: number }> {
    return listClientDirectory(this.db, query);
  }

  getPortfolioSummary(scope: ClientScope): Promise<ClientPortfolioSummary> {
    return getClientPortfolioSummary(this.db, scope);
  }

  listMonitors(clientId: string, includeIpRanges: boolean): Promise<ClientMonitorRow[]> {
    return listClientMonitors(this.db, clientId, includeIpRanges);
  }

  usageByMonth(clientId: string): Promise<ClientUsageMonth[]> {
    return usageByMonth(this.db, clientId);
  }

  listDevices(clientId: string, includeDecommissioned: boolean): Promise<ClientDeviceRow[]> {
    return listClientDevices(this.db, clientId, includeDecommissioned);
  }

  listDevicesDirectory(query: ClientDeviceDirectoryQuery): Promise<{ items: ClientDeviceDirectoryRow[]; total: number }> {
    return listClientDevicesDirectory(this.db, query);
  }

  getClientStats(clientId: string): Promise<ClientDetailStats> {
    return getClientStats(this.db, clientId);
  }

  findSftpDestinationRaw(clientId: string): Promise<StoredSftpDestination | null> {
    return findSftpDestinationRaw(this.db, clientId);
  }

  updateSftpDestination(clientId: string, stored: StoredSftpDestination | null): Promise<void> {
    return updateSftpDestination(this.db, clientId, stored);
  }
}
