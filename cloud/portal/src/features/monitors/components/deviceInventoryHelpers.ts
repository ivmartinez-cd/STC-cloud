import type { Device } from '../../../shared/types/monitor';
import type { AgentDeviceDirectoryRow, AgentDeviceSegment, AgentDeviceSortField } from '../types/monitorDetail';
import { APP_LOCALE } from '../../../shared/lib/formatters';

// La casilla de selección es una columna propia (28px) — antes compartía la
// pista ancha con "equipo" (el header nunca reservaba un track para ella),
// así que la fila (8 elementos) quedaba corrida una posición contra el
// header (7 elementos): "equipo" invadía la pista de ESTADO, ESTADO la de
// DIRECCIÓN IP, etc. Ahora header y fila usan siempre las mismas 8 pistas.
export const GRID_COLS = 'grid-cols-[28px_minmax(220px,1fr)_132px_130px_128px_90px_96px_40px]';

export const SEGMENT_OPTIONS: Array<{ value: AgentDeviceSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'sin_conexion', label: 'OFFLINE' },
  { value: 'con_alertas', label: 'CON ALERTAS' },
  { value: 'sin_aprobar', label: 'SIN APROBAR' },
];

export const SORTABLE_HEADERS: Array<{ field: AgentDeviceSortField; label: string }> = [
  { field: 'consumible_pct', label: 'CONSUMIBLES' },
  { field: 'alerts_count', label: 'ALERTAS' },
  { field: 'last_seen', label: 'ÚLT. REPORTE' },
];

export const SORT_LABELS: Record<AgentDeviceSortField, string> = { alerts_count: 'alertas', consumible_pct: 'consumibles', last_seen: 'último reporte' };

export const ESTADO_LABEL: Record<AgentDeviceDirectoryRow['estado'], string> = {
  en_linea: 'EN LÍNEA', sin_conexion: 'SIN CONEXIÓN', sin_aprobar: 'SIN APROBAR',
};

export function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}

export function formatLastReport(iso: string | null): string {
  if (!iso) return 'sin reporte';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} d`;
}

export function pageWindow(current: number, totalPages: number): Array<number | 'ellipsis'> {
  const withEnds = new Set<number>([0, totalPages - 1]);
  for (let i = Math.max(0, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) withEnds.add(i);
  const sorted = Array.from(withEnds).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  let prev: number | null = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('ellipsis');
    result.push(p);
    prev = p;
  }
  return result;
}

export function exportCountersCSV(devices: Device[], monitorName: string, discriminate: boolean) {
  const today = new Date().toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = ['SERIE;FECHA;TIPO;CLASE;CONTADOR;CLASE;CONTADOR;MOTIVO;OBSERVACIONES;NUMERO_ACTIVO;NUMERO_ETIQUETA;USO_30D;CICLO_TRABAJO'];

  for (const d of devices) {
    const serie = d.serial_number ?? 'S/N';
    const mono = d.mono_pages ?? 0;
    const color = d.color_pages ?? 0;
    const total = d.total_pages ?? (mono + color);
    const isColor = color > 0;
    const inventoryCols = `${d.asset_number ?? ''};${d.asset_tag ?? ''};${d.pages_30d ?? ''};${d.duty_cycle_effective ?? ''}`;

    let row: string;
    if (isColor) {
      row = discriminate
        ? `${serie};${today};7;10;${mono};20;${color};;;${inventoryCols}`
        : `${serie};${today};7;20;${total};;;;;${inventoryCols}`;
    } else {
      row = `${serie};${today};7;10;${mono};;;;;${inventoryCols}`;
    }
    rows.push(row);
  }

  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contadores_${monitorName.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
