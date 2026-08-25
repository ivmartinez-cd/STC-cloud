import type { AlertClass } from '../../../shared/types/alerts';

export const PAGE_SIZE = 50;

export const SEVERITY_LABELS: Record<string, string> = { critical: 'Crítico', warning: 'Advertencia' };

/**
 * Color por familia de clase — mismo criterio visual que HP SDS: rojo = ya
 * pasó algo (agotado/fallo/atasco), ámbar = se está por agotar/requiere
 * atención, slate = informativo, azul = disponibilidad/infraestructura.
 */
export const CLASS_COLOR: Record<AlertClass, string> = {
  consumable_out: 'bg-rose-100 text-rose-700',
  system_failure: 'bg-rose-100 text-rose-700',
  jam: 'bg-rose-100 text-rose-700',
  subunit_out: 'bg-rose-100 text-rose-700',
  media_out: 'bg-rose-100 text-rose-700',
  consumable_low: 'bg-amber-100 text-amber-700',
  system_warning: 'bg-amber-100 text-amber-700',
  user_action: 'bg-amber-100 text-amber-700',
  subunit_low: 'bg-amber-100 text-amber-700',
  media_low: 'bg-amber-100 text-amber-700',
  information: 'bg-slate-100 text-slate-600',
  system_change: 'bg-slate-100 text-slate-600',
  other: 'bg-slate-100 text-slate-600',
  availability: 'bg-blue-100 text-blue-700',
};

export const SEVERITY_COLOR = (severity: string) =>
  severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';

export function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const SELECT_CLASS =
  'bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-100 outline-none focus:border-brand cursor-pointer';

export const TH_CLASS = 'py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest';
