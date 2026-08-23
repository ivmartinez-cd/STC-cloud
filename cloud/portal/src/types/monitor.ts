import type { IpRange, BusinessHoursConfig } from './agents';

export interface SuppliesItem {
  percentage?: number | null;
  status?: string | null;
  /** Part number instalado (p. ej. W2020A, MLT-D201L). */
  code?: string | null;
  /** Número de pedido recomendado por el equipo (si difiere del instalado). */
  orderNumber?: string | null;
  serial?: string | null;
  capacity?: number | null;
  printed?: number | null;
  remainingPages?: number | null;
  remainingDays?: number | null;
  firstInstallDate?: string | null;
  lastUseDate?: string | null;
}

export interface InputTrayInfo {
  name: string;
  paperType?: string | null;
  paperSize?: string | null;
  level?: number | null;
  capacity?: number | null;
  status?: string | null;
}

export interface OutputTrayInfo {
  name: string;
  capacity?: string | number | null;
  level?: number | null;
  status?: string | null;
}

export interface CounterRowDetail {
  print: number;
  report: number;
  total: number;
}

export interface CounterTriple {
  mono?:  number | null;
  color?: number | null;
  total?: number | null;
}

export interface ScanCounters {
  copy?:  number | null;
  send?:  number | null;
  fax?:   number | null;
  total?: number | null;
}

export interface DetailedCounters {
  monoSimplex?: CounterRowDetail;
  duplex?: CounterRowDetail;
  colorSimplex?: CounterRowDetail;
  colorDuplex?: CounterRowDetail;
  totalImpressions?: CounterRowDetail;
  print?:            CounterTriple;
  copy?:             CounterTriple;
  fax?:              CounterTriple;
  equivalentA4?:     CounterTriple;
  duplexEquivalent?: CounterTriple;
  scans?:            ScanCounters;
  engineCycles?:      number | null;
  colorEngineCycles?: number | null;
}

/** Datos del equipo sin columna propia (llegan en supplies_details.device). */
export interface DeviceExtraInfo {
  sku?:              string | null;
  alias?:            string | null;
  dnsName?:          string | null;
  firmwarePackage?:  string | null;
  firmwareRevision?: string | null;
  firmwareDate?:     string | null;
  platform?:         string | null;
  formatterNumber?:  string | null;
  ramMb?:            number | null;
  manufacturer?:     string | null;
}

export interface SuppliesDetails {
  toners?: {
    black?: SuppliesItem;
    cyan?: SuppliesItem;
    magenta?: SuppliesItem;
    yellow?: SuppliesItem;
  };
  drums?: {
    black?: SuppliesItem;
    cyan?: SuppliesItem;
    magenta?: SuppliesItem;
    yellow?: SuppliesItem;
  };
  maintenance?: {
    fuser?: SuppliesItem;
    transferBelt?: SuppliesItem;
    transferRoller?: SuppliesItem;
    tray1Roller?: SuppliesItem;
    tray1RetardRoller?: SuppliesItem;
    mpTrayRoller?: SuppliesItem;
    mpTrayRetardRoller?: SuppliesItem;
    wasteToner?: SuppliesItem;
    other?: Array<{ name: string; percentage?: number | null; status?: string | null; maxCapacity?: number | null; currentCount?: number | null }>;
  };
  inputTrays?: InputTrayInfo[];
  outputTrays?: OutputTrayInfo[];
  alerts?: Array<{ code?: string; description?: string; severity?: string; time?: string }>;
  counters?: DetailedCounters;
  device?: DeviceExtraInfo;
}

export interface Device {
  id: string;
  agent_id?: string | null;
  active?: boolean;
  name: string;
  ip_address: string;
  serial_number: string | null;
  last_seen: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  brand: string | null;
  firmware?: string | null;
  mac?: string | null;
  hostname?: string | null;
  location?: string | null;
  sku?: string | null;
  poll_method?: string | null;
  created_at?: string | null;
  toner_black?: number | null;
  toner_cyan?: number | null;
  toner_magenta?: number | null;
  toner_yellow?: number | null;
  monthly_pages?: number | null;
  monthly_mono?: number | null;
  monthly_color?: number | null;
  supplies_details?: SuppliesDetails | string | null;
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
  // Identidad por cliente + ciclo de vida (§2.4 del gap analysis).
  client_id?:             string | null;
  name_override?:         string | null;
  location_override?:     string | null;
  decommissioned_at?:     string | null;
  decommissioned_by?:     string | null;
  decommission_reason?:   string | null;
  merged_into?:           string | null;
  merged_into_serial?:    string | null;
  merged_at?:             string | null;
}

/**
 * Lista de credenciales SNMP por agente (§2.3 gap analysis: SNMPv3 + lista
 * probada en orden). Espejo del lado cloud (`services/snmpCredentials.ts`) —
 * ver ese archivo para el porqué del layout (secretos individualmente
 * cifrados, resto en claro a propósito).
 */
export type SnmpVersion = 'v1' | 'v2c' | 'v3';
export type SnmpSecurityLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
export type SnmpAuthProtocol = 'md5' | 'sha' | 'sha224' | 'sha256' | 'sha384' | 'sha512';
export type SnmpPrivProtocol = 'des' | 'aes' | 'aes256b' | 'aes256r';

/** Lo que devuelve el backend — nunca un secreto, sólo si está configurado o no. */
export interface MaskedSnmpCredential {
  id: string;
  version: SnmpVersion;
  label: string | null;
  username?: string;
  security_level?: SnmpSecurityLevel;
  auth_protocol?: SnmpAuthProtocol;
  priv_protocol?: SnmpPrivProtocol;
  has_community: boolean;
  has_auth_key: boolean;
  has_priv_key: boolean;
}

/**
 * Body de `PUT /agents/:id/snmp-credentials` — cada entrada es o bien una
 * referencia a una entrada ya guardada (`ref`, se conserva tal cual, no
 * repite secretos — así reordenar/renombrar/borrar no exige re-tipear
 * contraseñas) o material nuevo a cifrar.
 */
export type SnmpCredentialInput =
  | { ref: string }
  | { version: 'v1' | 'v2c'; label?: string | null; community: string }
  | {
      version: 'v3';
      label?: string | null;
      username: string;
      security_level: SnmpSecurityLevel;
      auth_protocol?: SnmpAuthProtocol;
      auth_key?: string;
      priv_protocol?: SnmpPrivProtocol;
      priv_key?: string;
    };

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
    ip_ranges: IpRange[];
    snmp_community: string;
    toner_warning_threshold?: number;
    toner_critical_threshold?: number;
    snmp_credentials?: MaskedSnmpCredential[];
    snmp_credentials_rev?: number;
    business_hours?: BusinessHoursConfig;
  };
  version?: string;
  host_name?: string;
  host_os?: string;
  host_ip?: string;
  uptime?: string;
}

export interface EditFormData {
  name: string;
  ip_ranges: IpRange[];
  snmp: string;
  tonerWarningThreshold: number;
  tonerCriticalThreshold: number;
  businessHours: BusinessHoursConfig;
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
  systemHealth: { status: 'healthy' | 'degraded' | 'error'; uptime: number; lastSync: string | null; lastClient?: string | null; readingsCount24h?: number; clientsWithAlertsCount?: number };
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  contact_phone: string | null;
  notification_email: string | null;
  notification_webhook_url: string | null;
  monitor_count: number;
  device_count: number;
}

/** `GET /clients/:id/api-keys` — nunca trae el valor en claro (sólo al crearla). */
export interface ApiKeyRecord {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type PublicApiEvent = 'reading.created' | 'alert.created' | 'report.closed';

/** `GET/PUT /clients/:id/webhook` — config del webhook de la API pública
 *  (integración ERP), no confundir con `notification_webhook_url` de arriba. */
export interface WebhookConfig {
  url: string;
  events: PublicApiEvent[];
  secret: string;
  active: boolean;
}

export interface Monitor {
  id: string;
  name: string;
  status: string;
  last_seen: string | null;
  device_count: number;
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
}
