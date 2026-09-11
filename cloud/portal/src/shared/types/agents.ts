import { OFFLINE_THRESHOLD_MS, SNMP_DEFAULT_COMMUNITY } from '../lib/constants';

export type Agent = {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked' | 'offline';
  last_seen: string | null;
  client_id: string;
  client_name?: string;
  /** Opt-in, default false — acceso remoto controlado a la EWS del dispositivo
   *  vía túnel sobre el WSS existente. Ver PUT /agents/:id/remote-ews. */
  remote_ews_enabled?: boolean;
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
  /** Point lookup — el agente resuelve por DNS en cada ciclo de discovery. */
  hostname?: string;
  /**
   * Ausente o `true` = habilitado (comportamiento de siempre, retrocompatible
   * con los rangos guardados antes de que existiera el campo). `false` = el
   * cloud NO lo manda al agente: lo filtra al compilar el heartbeat, así que
   * el agente nunca ve `enabled` — cero cambio de formato de alambre. Sirve
   * para apagar un segmento sin perder su configuración (etiqueta,
   * exclusiones, credenciales) ni tener que volver a tipearlo.
   */
  enabled?: boolean;
  exclude?: string[];
  /** Restringe qué credenciales de `snmp_credentials` se prueban para esta
   *  entrada durante discovery. Ausente/vacío = pool completo (comportamiento
   *  de siempre). Editable desde `CredentialIdsSelect` (dentro de
   *  `IpRangesEditor`) cuando el agente tiene credenciales adicionales
   *  configuradas. */
  credential_ids?: string[];
}

/**
 * Horario laboral + TZ (§2.1/§3 R7 gap analysis). Espejo del lado cloud
 * (`services/businessHours.ts`). Siempre llega resuelto (nunca `null`) desde
 * `GET /agents/:id`/`GET /agents/:id/config` — el cloud aplica el default
 * hardcodeado (Argentina, L-V, 8-18) ahí mismo.
 */
export type BusinessHoursConfig = {
  timezone: string;
  days: number[];
  start_hour: number;
  end_hour: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: 'America/Argentina/Buenos_Aires',
  days: [1, 2, 3, 4, 5],
  start_hour: 8,
  end_hour: 18,
};

/** Un loop de monitoreo (minutos en/fuera de horario laboral). */
export type IntervalPair = { biz: number; off: number };

/**
 * Intervalos de los 4 loops de monitoreo del agente (Alert/Identity/Meter/
 * Consumables), personalizables por agente. Espejo del lado cloud
 * (`shared/domain/monitor-intervals.ts`). Siempre llega resuelto (nunca
 * `null`) desde `GET /agents/:id`/`GET /agents/:id/config` — el cloud aplica
 * el default hardcodeado ahí mismo (White Paper "Monitoring Loops" de HP SDS).
 */
export type MonitorIntervalsConfig = {
  alert: IntervalPair;
  discovery: IntervalPair;
  meter: IntervalPair;
  supplies: IntervalPair;
}

export const DEFAULT_MONITOR_INTERVALS: MonitorIntervalsConfig = {
  alert:     { biz: 3,  off: 15 },
  discovery: { biz: 10, off: 60 },
  meter:     { biz: 20, off: 240 },
  supplies:  { biz: 60, off: 240 },
};

export type AgentConfig = {
  ip_ranges: IpRange[];
  snmp_community: string;
  /** Sólo lectura acá — la vista enmascarada completa (con reorder/reemplazo)
   *  vive en el tab "Configuración" del detalle del monitor. Ausente cuando
   *  no hay ninguna credencial adicional configurada. */
  snmp_credentials?: unknown[];
  business_hours?: BusinessHoursConfig;
  monitor_intervals?: MonitorIntervalsConfig;
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
