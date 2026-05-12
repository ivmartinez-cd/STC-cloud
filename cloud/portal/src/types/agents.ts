import { OFFLINE_THRESHOLD_MS, SNMP_DEFAULT_COMMUNITY, SCAN_DEFAULT_INTERVAL } from '../lib/constants';

export type Agent = {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked' | 'offline';
  last_seen: string | null;
  client_id: string;
  client_name?: string;
}

export type IpRange = {
  start: string;
  end: string;
}

export type AgentConfig = {
  ip_ranges: IpRange[];
  snmp_community: string;
  scan_interval_minutes: number;
}

export interface Client { id: string; name: string }

export const emptyRange = (): IpRange => ({ start: '', end: '' });

export function isAgentOffline(agent: Agent): boolean {
  if (agent.status !== 'active' && agent.status !== 'offline') return false;
  if (!agent.last_seen) return true;
  return Date.now() - new Date(agent.last_seen).getTime() > OFFLINE_THRESHOLD_MS;
}

export const defaultConfig: AgentConfig = {
  ip_ranges: [],
  snmp_community: SNMP_DEFAULT_COMMUNITY,
  scan_interval_minutes: SCAN_DEFAULT_INTERVAL,
};
