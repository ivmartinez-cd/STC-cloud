import type { AgentRow, SystemInfoPayload } from "../entities/agent";
import type { AgentConfigRow, DevicePolicyRow } from "../services/agent-config-view";

export interface NewPendingAgent {
  id: string;
  clientId: string;
  name: string;
  activationKey: string;
  expiresAt: Date;
  ipRanges: string | null;
  snmpCommunity: string;
  scanIntervalMinutes: number;
  businessHours: string | null;
}

export interface SnmpCredentialsRow {
  snmp_credentials: unknown;
  snmp_credentials_rev: number | null;
  ip_ranges: unknown;
}

/** Ciclo de vida, configuración y heartbeat de `agents`. */
export interface AgentRepository {
  findById(id: string): Promise<AgentRow | null>;
  /** Llave vigente: sólo agentes `pending`/`offline`. */
  findByActivationKey(key: string): Promise<AgentRow | null>;
  /** Para el refresh: sólo `active`/`offline`. */
  findRefreshable(id: string): Promise<AgentRow | null>;
  insertPending(agent: NewPendingAgent): Promise<void>;
  activate(id: string, hardwareId: string, refreshTokenHash: string): Promise<void>;
  rotateRefreshToken(id: string, refreshTokenHash: string): Promise<void>;
  resetActivation(id: string, activationKey: string, expiresAt: Date): Promise<void>;
  setStatus(id: string, status: string): Promise<void>;
  updateColumns(id: string, updates: Record<string, unknown>): Promise<void>;
  getConfigRow(id: string): Promise<AgentConfigRow | null>;
  getIpRangesRaw(id: string): Promise<unknown | undefined>;
  getSnmpCredentialsRow(id: string): Promise<SnmpCredentialsRow | null>;
  replaceSnmpCredentials(id: string, stored: string, rev: number): Promise<void>;
  /** Equipos con `monitor_state <> 'full'` o `registration_state = 'ignored'` (tope 500). */
  devicePolicies(agentId: string): Promise<DevicePolicyRow[]>;
  /** `client_id` + `device_approval_required` del cliente en un solo join. */
  clientContext(agentId: string): Promise<{ clientId: string | null; approvalRequired: boolean }>;
  heartbeat(id: string, systemInfo?: SystemInfoPayload): Promise<void>;
  /** `last_seen`+`active` al recibir lecturas; nunca falla si el agente fue eliminado. */
  touchOnSync(id: string): Promise<void>;
}
