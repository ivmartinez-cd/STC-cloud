import { OFFLINE_THRESHOLD_MS, SNMP_DEFAULT_COMMUNITY } from '../lib/constants';

export type Agent = {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked' | 'offline';
  last_seen: string | null;
  client_id: string;
  client_name?: string;
}

/**
 * Una entrada de `ip_ranges` — rango manual (`start`+`end`) O bloque CIDR
 * (`cidr`), nunca ambos. `exclude` son IPs individuales a saltear dentro del
 * rango/bloque. Espejo del lado cloud (`services/ipRangeSpec.ts`) — el
 * agente nunca ve CIDR ni exclusiones, el cloud las compila a pares
 * `{start,end}` planos antes de mandarlas por el heartbeat.
 */
export type IpRange = {
  label?: string | null;
  start?: string;
  end?: string;
  cidr?: string;
  exclude?: string[];
}

export type AgentConfig = {
  ip_ranges: IpRange[];
  snmp_community: string;
  /** Sólo lectura acá — la vista enmascarada completa (con reorder/reemplazo)
   *  vive en el tab "Configuración" del detalle del monitor. Ausente cuando
   *  no hay ninguna credencial adicional configurada. */
  snmp_credentials?: unknown[];
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
};
