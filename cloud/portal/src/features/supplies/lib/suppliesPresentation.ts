import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { SupplyUrgency } from '../../../shared/types/supplies';

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

export { SWATCH_HEX } from '../../../shared/lib/supplyColors';

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
