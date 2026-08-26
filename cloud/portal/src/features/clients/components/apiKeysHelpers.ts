import type { ApiKeyRecord, PublicApiEvent } from '../../../shared/types/monitor';

export const EVENT_LABELS: Record<PublicApiEvent, string> = {
  'reading.created': 'Lecturas nuevas',
  'alert.created': 'Alertas nuevas',
  'report.closed': 'Cierres de reporte',
};

export const ALL_EVENTS: PublicApiEvent[] = ['reading.created', 'alert.created', 'report.closed'];

/** '' = sin vencimiento (comportamiento de siempre). */
export const EXPIRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Sin vencimiento' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

export function isExpired(k: ApiKeyRecord): boolean {
  return !!k.expires_at && new Date(k.expires_at).getTime() <= Date.now();
}
