export interface MonitorListItem {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked';
  last_seen: string | null;
  client_id: string;
}

export interface IpRange {
  start: string;
  end: string;
}

export interface MonitorConfig {
  ip_ranges: IpRange[];
  snmp_community: string;
}

export interface ClientOption {
  id: string;
  name: string;
}
