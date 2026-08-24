import type { AgentScope } from "../entities/agent";

export interface AgentDeleteSnapshot {
  name: string | null;
  client_id: string | null;
}

/** Lecturas y borrado del portal sobre `agents` (tabla ancha → read models snake_case). */
export interface AgentPortalRepository {
  /** Columnas seguras + `client_name`, scope por cliente, techo 2000. */
  list(scope: AgentScope): Promise<unknown[]>;
  /** Ficha con contadores de equipos; `full=true` (admin/operator) agrega activation_key + bloque de config. */
  getDetail(id: string, full: boolean): Promise<Record<string, any> | null>;
  /** Equipos del agente con volumen mensual (deltas positivos) y uso 30d. */
  listDevices(agentId: string, includeDecommissioned: boolean): Promise<unknown[]>;
  snapshotForDelete(id: string): Promise<AgentDeleteSnapshot | null>;
  deviceIdsOf(agentId: string): Promise<string[]>;
  anyClosureLines(deviceIds: string[]): Promise<boolean>;
  /** Borra lecturas + equipos del agente (cascada explícita) y el agente. */
  deleteCascade(agentId: string, deviceIds: string[]): Promise<void>;
  findEwsAgent(id: string): Promise<{ remote_ews_enabled: boolean; scan_interval_minutes: number | null } | null>;
  findEwsDevice(agentId: string, deviceId: string): Promise<{ id: string; ip_address: string | null; last_seen: Date | null } | null>;
  /** Filas tocadas (0 = agente inexistente). */
  setRemoteEwsEnabled(id: string, enabled: boolean): Promise<number>;
}
