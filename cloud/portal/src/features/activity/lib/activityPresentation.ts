import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { AuditCategory, AuditLogItem } from '../../../shared/types/audit';

export const PAGE_SIZE = 50;

/** Misma escala de 3 tonos que el resto del handoff (severo/atención/neutro),
 * duplicada a propósito (el guard `arch-portal` bloquea importar entre
 * features) — acá por CATEGORÍA, no por clase de alerta. */
const CATEGORY_ACCENT: Record<AuditCategory, string> = {
  security: 'bg-brand-severe',
  device: 'bg-brand', client: 'bg-brand-light', agent: 'bg-brand-gray',
  user: 'bg-brand', alert: 'bg-brand-light', report: 'bg-ink-500', other: 'bg-ink-500',
};

export function categoryAccent(category: AuditCategory): string {
  return CATEGORY_ACCENT[category] ?? 'bg-ink-500';
}

export function targetHref(item: AuditLogItem): string | null {
  if (!item.target_id) return null;
  if (item.target_kind === 'device') return `/devices/${item.target_id}`;
  if (item.target_kind === 'agent') return `/monitors/${item.target_id}`;
  if (item.target_kind === 'client') return `/clients/${item.target_id}`;
  return null;
}

/** UUID crudo como identificador interno → monoespaciada; nombre legible → sans. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isRawId(v: string | null): boolean {
  return !!v && UUID_RX.test(v);
}

export function fmtTime(v: string): string {
  return new Date(v).toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const DAY_LABEL = new Intl.DateTimeFormat(APP_LOCALE, { weekday: 'long', day: '2-digit', month: 'long' });

export function dayKeyOf(v: string): string {
  return v.slice(0, 10);
}

export function dayLabelOf(v: string): string {
  return DAY_LABEL.format(new Date(v)).toUpperCase();
}

export interface DayGroup { key: string; label: string; items: AuditLogItem[] }

/** Agrupa por día calendario (handoff hifi #3, fase 5) — la página ya viene
 * ordenada por fecha desc del backend, agrupar es sólo partir esa lista. */
export function groupByDay(items: AuditLogItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const key = dayKeyOf(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabelOf(item.created_at), items: [item] });
  }
  return groups;
}

export function todayIso(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
