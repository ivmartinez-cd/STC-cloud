import type { AgentConfigUpdate, AgentScope, AuditContext } from "../../domain/entities/agent";

export type CreateAgentConfig = Pick<AgentConfigUpdate, "ip_ranges" | "snmp_community" | "scan_interval_minutes" | "business_hours">;

export interface CreateActivationKeyInput {
  clientId: string;
  name: string;
  config?: CreateAgentConfig;
  audit?: AuditContext;
}

export interface CreateActivationKeyResult {
  agentId: string;
  key: string;
  expiresAt: Date;
}

export interface ActivateAgentResult {
  agentId: string;
  refreshToken: string;
}

export interface UpdateConfigResult {
  status: "success";
  warnings: string[];
}

export type ReplaceSnmpCredentialsResult =
  | { status: "success"; count: number; rev: number; warnings: string[] }
  | { status: "conflict"; rev: number }
  | null;

export interface SyncReadingsResult {
  received: number;
  inserted: number;
  duplicates: number;
}

export interface Actor {
  userId: string | null;
  ipAddress: string | null;
}

export interface ScopedAgentId {
  id: string;
  scope: AgentScope;
}

export interface SendCommandInput extends Actor {
  agentId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface EwsProxyInput extends Actor {
  agentId: string;
  deviceId: string;
  path: unknown;
}

export interface EwsProxyOutput {
  status: number;
  headers: Record<string, string>;
  body_base64: string;
  truncated: boolean;
}
