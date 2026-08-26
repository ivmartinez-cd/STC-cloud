import { APP_LOCALE } from '../../../shared/lib/formatters';

export const PAGE_SIZE = 50;

/** Mismo punteado de 3 tonos que `features/alerts/lib/alertPresentation.ts`
 * (duplicado a propósito — el guard `arch-portal` bloquea importar entre
 * features). Los valores de `class` acá son los mismos `alert_class` que
 * siembra `incident_rules` (`GLOBAL_CLASSES`), así que la escala es idéntica. */
const CLASS_ACCENT: Record<string, string> = {
  consumable_out: 'bg-brand-severe', system_failure: 'bg-brand-severe', jam: 'bg-brand-severe',
  subunit_out: 'bg-brand-severe', media_out: 'bg-brand-severe',
  availability: 'bg-brand', consumable_low: 'bg-brand-light', system_warning: 'bg-brand-light',
  user_action: 'bg-brand-light', subunit_low: 'bg-brand-light', media_low: 'bg-brand-light',
  system_change: 'bg-brand-gray', information: 'bg-ink-500', other: 'bg-ink-500',
};

export function classAccent(klass: string): string {
  return CLASS_ACCENT[klass] || 'bg-ink-500';
}

export function statusChipProps(status: string): { label: string; variant: 'neutral' | 'attention' } {
  if (status === 'closed') return { label: 'CERRADO', variant: 'neutral' };
  if (status === 'in_progress') return { label: 'EN CURSO', variant: 'attention' };
  if (status === 'on_hold') return { label: 'EN ESPERA', variant: 'attention' };
  return { label: 'ABIERTO', variant: 'attention' };
}

export function originChipProps(origin: string): { label: string; variant: 'neutral' | 'attention' } {
  return origin === 'manual' ? { label: 'MANUAL', variant: 'attention' } : { label: 'AUTOMÁTICO', variant: 'neutral' };
}

const AGING_OLD_THRESHOLD_SECONDS = 24 * 3600;

/** Naranja sólo si sigue abierto Y pasó las 24h (default order de la tabla,
 * handoff hifi #3 fase 4) — un cerrado viejo no es una urgencia, es historia. */
export function agingColorClass(agingSeconds: number, status: string): string {
  if (status === 'closed') return 'text-ink-200';
  return agingSeconds >= AGING_OLD_THRESHOLD_SECONDS ? 'text-brand-severe' : 'text-ink-600';
}

export function fmtAging(seconds: number | string): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  if (days > 0) return `${days} d ${hours} h`;
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours} h ${mins} m`;
  return `${mins} m`;
}

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
