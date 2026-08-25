import type { Client, Monitor } from '../../../shared/types/monitor';
import { OFFLINE_THRESHOLD_MS } from '../../../shared/lib/constants';

export type ClientEstado = 'activo' | 'sin_contacto' | 'sin_reporte';

/**
 * Mismo criterio de 3 estados que `ESTADO_CASE_SQL` (`KnexClientRepository`, usado por
 * el listado de Clientes), pero derivado en el FRONT a partir de datos que el detalle
 * de cliente ya trae (`client.contact_name` + `monitors[].last_seen`) — el endpoint
 * viejo `GET /clients/:id` no expone `estado` (no se toca, ver alcance del handoff) y
 * no vale la pena una consulta nueva sólo para un chip cosmético. Prioridad: sin
 * contacto > sin reporte (ningún monitor activo hace >24h) > activo.
 */
export function deriveClientEstado(client: Pick<Client, 'contact_name'>, monitors: Pick<Monitor, 'last_seen'>[]): ClientEstado {
  if (!client.contact_name || !client.contact_name.trim()) return 'sin_contacto';
  const now = Date.now();
  const hasRecentReport = monitors.some((m) => m.last_seen !== null && now - new Date(m.last_seen).getTime() <= OFFLINE_THRESHOLD_MS);
  return hasRecentReport ? 'activo' : 'sin_reporte';
}

export const CLIENT_ESTADO_LABEL: Record<ClientEstado, string> = {
  activo: 'ACTIVO', sin_contacto: 'SIN CONTACTO', sin_reporte: 'SIN REPORTE',
};
