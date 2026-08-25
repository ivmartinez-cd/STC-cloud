/**
 * Filas de consumibles y estimaciones a partir de DATOS REALES del dispositivo.
 * Nada se inventa: si un dato no existe, queda `null` y la UI muestra "—".
 *  - Tóners: supplies_details.toners (EWS/SNMP) con fallback a las columnas planas del dispositivo.
 *  - Tambores, kits de mantenimiento, residuo: supplies_details.drums / maintenance.
 *  - Páginas restantes: las informa el equipo; si no, capacidad × % (sólo si la capacidad es real).
 *  - Días restantes: páginas restantes / ritmo de impresión observado en el historial de lecturas.
 */
import type { Device, SuppliesDetails, SuppliesItem } from '../../../shared/types/monitor';

export interface ReadingPoint {
  time: string;
  total_pages: number | null;
  mono_pages?: number | null;
  color_pages?: number | null;
}

export interface SupplyRow {
  key:        string;
  description: string;
  kind:       'Tóner' | 'Tambor de imagen' | 'Fusor' | 'Rodillo' | 'Banda de transferencia' | 'Depósito de residuos' | 'Kit de mantenimiento' | 'Otro';
  color:      'Negro' | 'Cian' | 'Magenta' | 'Amarillo' | 'Sin color';
  colorClass: string;
  percentage: number | null;
  status:     string | null;
  code:       string | null;
  orderNumber: string | null;
  serial:     string | null;
  capacity:   number | null;
  printed:    number | null;
  remainingPages: number | null;
  remainingDays:  number | null;
  firstInstallDate: string | null;
  lastUseDate: string | null;
}

export interface UsageRate {
  /** Páginas por día (total) calculadas sobre el historial. */
  totalPerDay: number | null;
  colorPerDay: number | null;
  monoPerDay:  number | null;
  /** Días cubiertos por el historial usado. */
  spanDays:    number | null;
  samples:     number;
}

const DAY_MS = 86_400_000;

/** Ritmo de impresión observado: (último − más antiguo) / días, descartando ventanas < 12 h. */
export function usageRate(readings: ReadingPoint[]): UsageRate {
  const pts = readings
    .filter(r => r.total_pages != null && Number.isFinite(Number(r.total_pages)))
    .map(r => ({ t: new Date(r.time).getTime(), total: Number(r.total_pages), color: r.color_pages == null ? null : Number(r.color_pages), mono: r.mono_pages == null ? null : Number(r.mono_pages) }))
    .filter(p => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return { totalPerDay: null, colorPerDay: null, monoPerDay: null, spanDays: null, samples: pts.length };
  const first = pts[0], last = pts[pts.length - 1];
  const spanDays = (last.t - first.t) / DAY_MS;
  if (spanDays < 0.5) return { totalPerDay: null, colorPerDay: null, monoPerDay: null, spanDays, samples: pts.length };
  const rate = (a: number | null, b: number | null) => (a == null || b == null || b < a) ? null : (b - a) / spanDays;
  return {
    totalPerDay: rate(first.total, last.total),
    colorPerDay: rate(first.color, last.color),
    monoPerDay:  rate(first.mono, last.mono),
    spanDays, samples: pts.length,
  };
}

export function parseSuppliesDetails(raw: Device['supplies_details']): SuppliesDetails | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) as SuppliesDetails; } catch { return null; }
}

type TonerKey = 'black' | 'cyan' | 'magenta' | 'yellow';
const TONER_META: Array<{ key: TonerKey; label: SupplyRow['color']; cls: string; col: 'black' | 'cyan' | 'magenta' | 'yellow' }> = [
  { key: 'black',   label: 'Negro',    cls: 'bg-slate-900',  col: 'black' },
  { key: 'cyan',    label: 'Cian',     cls: 'bg-cyan-500',   col: 'cyan' },
  { key: 'magenta', label: 'Magenta',  cls: 'bg-pink-500',   col: 'magenta' },
  { key: 'yellow',  label: 'Amarillo', cls: 'bg-yellow-400', col: 'yellow' },
];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysFor(remainingPages: number | null, perDay: number | null): number | null {
  if (remainingPages == null || perDay == null || perDay <= 0) return null;
  return Math.round(remainingPages / perDay);
}

function itemRow(key: string, description: string, kind: SupplyRow['kind'], color: SupplyRow['color'], cls: string, item: SuppliesItem | undefined, perDay: number | null): SupplyRow | null {
  if (!item) return null;
  const pct = num(item.percentage);
  const capacity = num(item.capacity);
  const remainingPages = num(item.remainingPages) ?? (capacity != null && pct != null ? Math.round(capacity * pct / 100) : null);
  return {
    key, description, kind, color, colorClass: cls,
    percentage: pct,
    status: item.status ?? null,
    code: item.code ?? null,
    orderNumber: item.orderNumber ?? null,
    serial: item.serial ?? null,
    capacity,
    printed: num(item.printed),
    remainingPages,
    remainingDays: num(item.remainingDays) ?? daysFor(remainingPages, perDay),
    firstInstallDate: item.firstInstallDate ?? null,
    lastUseDate: item.lastUseDate ?? null,
  };
}

/** Construye las filas reales. `device` aporta las columnas planas como fallback de los tóners. */
export function buildSupplyRows(device: Device, details: SuppliesDetails | null, rate: UsageRate): SupplyRow[] {
  const rows: SupplyRow[] = [];
  for (const m of TONER_META) {
    const K = m.col === 'black' ? 'black' : m.col;
    const fromDetails = details?.toners?.[m.key];
    const flat: SuppliesItem = {
      percentage: device[`toner_${K}`] ?? null,
      code:       device[`cartridge_code_${K}`] ?? null,
      serial:     device[`cartridge_serial_${K}`] ?? null,
      capacity:   device[`cartridge_capacity_${K}`] ?? null,
    };
    const merged: SuppliesItem | undefined = (fromDetails || flat.percentage != null || flat.code)
      ? { ...flat, ...Object.fromEntries(Object.entries(fromDetails ?? {}).filter(([, v]) => v !== null && v !== undefined)) }
      : undefined;
    if (!merged) continue;
    // En equipos color, el negro se consume en todas las páginas; CMY según el ritmo de color.
    const perDay = m.key === 'black' ? rate.totalPerDay : (rate.colorPerDay ?? rate.totalPerDay);
    const row = itemRow(`toner-${m.key}`, `Cartucho de tóner ${m.label.toLowerCase()}`, 'Tóner', m.label, m.cls, merged, perDay);
    if (row) rows.push(row);
  }
  for (const m of TONER_META) {
    const row = itemRow(`drum-${m.key}`, `Unidad de imagen ${m.label.toLowerCase()}`, 'Tambor de imagen', m.label, m.cls, details?.drums?.[m.key], rate.totalPerDay);
    if (row) rows.push(row);
  }
  const mt = details?.maintenance;
  const named: Array<[keyof NonNullable<typeof mt>, string, SupplyRow['kind']]> = [
    ['fuser', 'Fusor', 'Fusor'], ['transferBelt', 'Banda de transferencia', 'Banda de transferencia'], ['transferRoller', 'Rodillo de transferencia', 'Rodillo'],
    ['tray1Roller', 'Rodillo bandeja 1', 'Rodillo'], ['tray1RetardRoller', 'Rodillo de retardo bandeja 1', 'Rodillo'],
    ['mpTrayRoller', 'Rodillo bandeja multiuso', 'Rodillo'], ['mpTrayRetardRoller', 'Rodillo de retardo bandeja multiuso', 'Rodillo'],
    ['wasteToner', 'Depósito de tóner residual', 'Depósito de residuos'],
  ];
  for (const [k, label, kind] of named) {
    const item = mt?.[k];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = itemRow(`mt-${String(k)}`, label, kind, 'Sin color', 'bg-slate-400', item as SuppliesItem, rate.totalPerDay);
    if (row) rows.push(row);
  }
  for (const o of mt?.other ?? []) {
    const row = itemRow(`mt-other-${o.name}`, o.name, 'Kit de mantenimiento', 'Sin color', 'bg-slate-400', { percentage: o.percentage, status: o.status, capacity: o.maxCapacity }, rate.totalPerDay);
    if (row) rows.push(row);
  }
  return rows;
}

/** YYYYMMDD → DD/MM/YYYY; ISO → fecha local; otro → tal cual. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-AR');
}

export function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : Math.round(v).toLocaleString('es-AR');
}
