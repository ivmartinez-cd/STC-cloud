import type { Device } from '../../../shared/types/monitor';
import type { ReadingPoint } from '../../supplies/lib/supplies';

export interface Reading extends ReadingPoint {
  id: string;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
}

/** Respuesta de GET /devices/:id (devices.* + joins de agente/cliente). */
export interface DeviceDetailData extends Device {
  monitor_name?:    string;
  client_name?:     string;
  client_id?:       string;
  agent_status?:    string;
  agent_last_seen?: string | null;
  status?:          string;
  name_reported?:      string | null;
  location_reported?:  string | null;
  merged_into_serial?: string | null;
}

export type DeviceDetailTab = 'general' | 'counters' | 'supplies' | 'media' | 'alerts' | 'incidents' | 'history' | 'costs';

/** Alerta activa deduplicada: del servidor + las que reporta el propio equipo. */
export interface ActiveAlertItem {
  key: string;
  severity: string;
  message: string;
  code?: string;
  time?: string;
}
