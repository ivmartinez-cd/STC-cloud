import type { IpRange, BusinessHoursConfig, MonitorIntervalsConfig } from '../agents';
import type { MaskedSnmpCredential } from './snmp';

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
    monitor_intervals?: MonitorIntervalsConfig;
  };
  /** Opt-in por monitor del acceso remoto a la EWS de sus equipos (ver `useRemoteEwsToggle`). */
  remote_ews_enabled?: boolean;
  /** Canal de update horneado en el binario (`stable`/`legacy`) y runtime del proceso vivo.
   *  Sólo sirven comparados — ver `updateChannelInfo`. */
  channel?: string | null;
  runtime?: string | null;
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
  monitorIntervals: MonitorIntervalsConfig;
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

export interface CreateMonitorForm {
  name: string;
  ipStart: string;
  ipEnd: string;
  snmp_community: string;
}
