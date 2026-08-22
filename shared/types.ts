// Tipos compartidos entre backend (cloud) y agente (agent)

export type AgentStatus  = 'pending' | 'active' | 'revoked';
export type DeviceBrand  = 'hp' | 'lexmark' | 'samsung' | 'xerox' | 'canon' | 'ricoh' | 'unknown';
export type DeviceStatus = 'idle' | 'printing' | 'warmup' | 'offline' | 'error';
export type CommandType  = 'FORCE_SCAN' | 'RESTART' | 'UPDATE_CONFIG' | 'PING';

export interface IpRange {
  start: string;
  end: string;
}

// IMonitor representa una sucursal/ubicación (antes "Agent")
export interface IMonitor {
  id: string;
  client_id: string;
  name: string;
  status: AgentStatus;
  ip_ranges: IpRange[];
  snmp_community: string;
  scan_interval_minutes: number;
  last_seen: string | null;
  created_at: string;
}

/** @deprecated Use IMonitor */
export type IAgent = IMonitor;

export interface IDevice {
  id: string;
  agent_id: string;
  ip: string;
  mac: string;
  serial: string;
  brand: DeviceBrand;
  model: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface IReading {
  time: string;
  device_id: string;
  total_pages: number;
  mono_pages: number | null;
  color_pages: number | null;
  status: DeviceStatus;
  offline: boolean;
}

export interface ICommand {
  type: CommandType;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface IClient {
  id: string;
  name: string;
  contact_email?: string;
  created_at: string;
}

// Payloads agente → cloud
export interface SyncPayload {
  readings: Omit<IReading, 'device_id'>[];
}

export interface RegisterDevicePayload {
  agentId: string;
  devices: Omit<IDevice, 'id' | 'created_at'>[];
}

export interface HeartbeatPayload {
  version: string;
  deviceCount: number;
  snmpErrors: number;
  memoryMb: number;
}

// Payloads cloud → portal (WebSocket)
export interface WebSocketEvent {
  event: 'new_reading' | 'monitor_offline' | 'monitor_online' | 'alert' | 'connected' | 'pong';
  data: unknown;
  timestamp: string;
}
