import { APP_LOCALE } from '../../../shared/lib/formatters';
import type { EmailStatus } from '../types/emailLog';

export const PAGE_SIZE = 50;

export const STATUS_LABELS: Record<EmailStatus, string> = {
  sent: 'ENTREGADO',
  error: 'ERROR',
  skipped_no_transport: 'SIN SMTP',
  skipped_no_recipient: 'SIN DESTINATARIO',
};

/** `EstadoChip`: `sent` es neutro (no requiere acción); el resto es `attention`
 * — con puntos distintos por causa, tal como pide el handoff (SIN DESTINATARIO
 * `brand-severe`, SIN SMTP `brand`) para distinguirlas de un vistazo. */
export function statusChipProps(status: EmailStatus): { variant: 'neutral' | 'attention'; dotClassName?: string } {
  if (status === 'sent') return { variant: 'neutral', dotClassName: 'bg-brand-gray' };
  if (status === 'skipped_no_recipient') return { variant: 'attention', dotClassName: 'bg-brand-severe' };
  return { variant: 'attention' }; // skipped_no_transport / error → punto default (brand)
}

export const EVENT_LABELS: Record<string, string> = {
  'alert.created': 'ALERTA',
  'incident.created': 'INCIDENTE',
  'supply_request.created': 'PEDIDO NUEVO',
  'supply_request.completed': 'PEDIDO COMPLETADO',
  'report.closed': 'CIERRE MENSUAL',
  scheduled_report: 'INFORME PROGRAMADO',
};

const EVENT_DOT: Record<string, string> = {
  'alert.created': 'bg-brand-severe',
  'incident.created': 'bg-brand-severe',
  'supply_request.created': 'bg-brand',
  'supply_request.completed': 'bg-brand',
};

export function eventDot(event: string): string {
  return EVENT_DOT[event] ?? 'bg-brand-gray';
}

export function fmtDate(v: string): string {
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
