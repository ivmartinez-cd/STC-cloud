import { APP_LOCALE } from '../../../shared/lib/formatters';

export const SEVERITY_LABELS: Record<string, string> = { critical: 'CRÍTICA', warning: 'ADVERTENCIA' };

/** Chips institucionales (handoff hifi #3, 26/08/2026) — reemplaza la paleta
 * rojo/ámbar anterior. Ambas severidades son `EstadoChip` variante `attention`
 * (fondo `brand-soft`); sólo cambia el punto: crítica `brand-severe`, advertencia
 * `brand` (el color por defecto de esa variante, no hace falta override). */
export function severityDot(severity: string): string | undefined {
  return severity === 'critical' ? 'bg-brand-severe' : undefined;
}

/** Punto de la columna CLASE — misma escala de 3 tonos (severo/atención/neutro)
 * que `features/dashboard/components/AlertsByClassCard.tsx`; duplicado a
 * propósito acá (el guard `arch-portal` bloquea importar entre features). */
const CLASS_DOT: Record<string, string> = {
  availability: 'bg-brand',
  system_change: 'bg-brand-gray',
  consumable_out: 'bg-brand-severe', system_failure: 'bg-brand-severe', jam: 'bg-brand-severe',
  subunit_out: 'bg-brand-severe', media_out: 'bg-brand-severe',
  consumable_low: 'bg-brand-light', system_warning: 'bg-brand-light', user_action: 'bg-brand-light',
  subunit_low: 'bg-brand-light', media_low: 'bg-brand-light',
  information: 'bg-ink-500', other: 'bg-ink-500',
};

export function classDot(alertClass: string | null | undefined): string {
  return (alertClass && CLASS_DOT[alertClass]) || 'bg-ink-500';
}

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
