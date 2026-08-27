import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { SupplyColor, SupplyUrgency } from '../../../shared/types/supplies';

export const URGENCY_LABELS: Record<SupplyUrgency, string> = {
  critico: 'CRÍTICO',
  bajo: 'NIVEL BAJO',
  normal: 'NORMAL',
  sin_lectura: 'SIN LECTURA',
};

/** `EstadoChip`: `sin_lectura` explica los `unknown` en vez de dejarlos sin
 * justificación (handoff hifi #3, fase 3, 26/08/2026) — nunca "—" solo. */
export function urgencyChipProps(u: SupplyUrgency): { variant: 'neutral' | 'attention'; dotClassName?: string } {
  if (u === 'critico') return { variant: 'attention', dotClassName: 'bg-brand-severe' };
  if (u === 'bajo') return { variant: 'attention' };
  if (u === 'sin_lectura') return { variant: 'neutral', dotClassName: 'bg-ink-200' };
  return { variant: 'neutral' };
}

/** Swatch desaturado del color real del cartucho (handoff hifi #3, §1 punto 6)
 * — nunca puntos saturados. */
export const SWATCH_HEX: Record<SupplyColor, string> = {
  Negro: '#2E3033',
  Cian: '#7FB8C4',
  Magenta: '#C48BA8',
  Amarillo: '#E8C776',
  'Sin color': '#DDE1E2',
};

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
