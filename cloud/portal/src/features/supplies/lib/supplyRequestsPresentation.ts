import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { SupplyRequestStatus } from '../types/supplyRequests';

export const PAGE_SIZE = 50;

/** `EstadoChip`: `pending` es la única que requiere acción (attention); el
 * resto —incluida `completed`— es neutro (handoff hifi #3, fase 3, 26/08/2026,
 * reemplaza la paleta rojo/ámbar/azul/verde anterior). */
export function statusChipProps(status: SupplyRequestStatus): { variant: 'neutral' | 'attention' } {
  return { variant: status === 'pending' ? 'attention' : 'neutral' };
}

export function originChipProps(origin: 'auto' | 'manual'): { variant: 'neutral' | 'attention' } {
  return { variant: origin === 'manual' ? 'attention' : 'neutral' };
}

export function originLabel(origin: 'auto' | 'manual'): string {
  return origin === 'manual' ? 'MANUAL' : 'AUTOMÁTICO';
}

export function fmtDate(v: string): string {
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "17 h" / "3 d" — antigüedad relativa compacta para la columna ANTIGÜEDAD. */
export function fmtAge(openedAt: string, closedAt: string | null): string {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const hours = Math.max(0, Math.round((end - new Date(openedAt).getTime()) / 3_600_000));
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
