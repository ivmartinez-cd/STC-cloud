export interface Device {
  id: string;
  name: string;
  ip_address: string;
  serial_number: string | null;
  last_seen: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  brand: string | null;
  toner_black?: number | null;
  toner_cyan?: number | null;
  toner_magenta?: number | null;
  toner_yellow?: number | null;
  monthly_pages?: number | null;
  monthly_mono?: number | null;
  monthly_color?: number | null;
  // Cartridge identity (from EWS)
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
}

export interface MonitorData {
  id: string;
  name: string;
  hardware_id: string | null;
  activation_key: string | null;
  status: 'pending' | 'active' | 'revoked' | 'offline';
  last_seen: string | null;
  client_id: string;
  client_name: string;
  config?: {
    ip_ranges: { start: string; end: string }[];
    snmp_community: string;
    scan_interval_minutes: number;
    toner_warning_threshold?: number;
    toner_critical_threshold?: number;
  };
  version?: string;
  host_name?: string;
  host_os?: string;
  host_ip?: string;
  uptime?: string;
}

export interface EditFormData {
  name: string;
  ipStart: string;
  ipEnd: string;
  snmp: string;
  interval: number;
  tonerWarningThreshold: number;
  tonerCriticalThreshold: number;
}

export interface DashboardData {
  stats: {
    devices: number;
    agents: { total: number; online: number };
    clients: number;
    volume: number;
    deviceTrend?: string | null;
  };
  topClients: Array<{ id: string; name: string; device_count: number }>;
  brands: Array<{ brand: string; count: number }>;
  offlineAgents: Array<{ id: string; name: string; client_name: string; last_seen: string }>;
  systemHealth: { status: 'healthy' | 'degraded' | 'error'; uptime: number; lastSync: string | null };
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  contact_phone: string | null;
  monitor_count: number;
  device_count: number;
}

export interface Monitor {
  id: string;
  name: string;
  status: string;
  last_seen: string | null;
  device_count: number;
  scan_interval_minutes: number;
  hardware_id: string | null;
  host_name: string | null;
}

export interface UsageMonth {
  month: string;
  mono: number;
  color: number;
}

export interface CreateMonitorForm {
  name: string;
  ipStart: string;
  ipEnd: string;
  snmp_community: string;
  scan_interval_minutes: number;
}
