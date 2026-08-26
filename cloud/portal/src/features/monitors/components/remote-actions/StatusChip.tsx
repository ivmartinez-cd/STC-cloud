export type StatusChipTone = 'idle' | 'attention' | 'neutral' | 'severe' | 'muted';

const TONE_CLS: Record<StatusChipTone, { box: string; text: string; dot: string }> = {
  idle:      { box: 'bg-surface-avatar', text: 'text-ink-650',  dot: 'bg-ink-400' },
  attention: { box: 'bg-brand-soft',     text: 'text-brand-accent', dot: 'bg-brand' },
  neutral:   { box: 'bg-surface-avatar', text: 'text-ink-650',  dot: 'bg-brand-gray' },
  severe:    { box: 'bg-brand-soft',     text: 'text-brand-accent', dot: 'bg-brand-severe' },
  muted:     { box: 'bg-surface-avatar', text: 'text-ink-400',  dot: 'bg-ink-200' },
};

/** Chip de estado local a "Acciones remotas" — el `EstadoChip` compartido
 * (`shared/components/EstadoChip.tsx`) sólo tiene 2 variantes (neutral/
 * attention) y esta pantalla necesita 5 combinaciones de color de punto
 * (programado/enviado/completado/con errores/cancelado), así que se define
 * acá en vez de tocar el archivo compartido (evita choque con el agente que
 * está rediseñando "Salud de Nodos" en paralelo sobre el mismo archivo). */
export default function StatusChip({ label, tone }: { label: string; tone: StatusChipTone }) {
  const cls = TONE_CLS[tone];
  return (
    <span className={`inline-flex items-center gap-[6px] justify-self-start rounded-[2px] ${cls.box} px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${cls.text}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${cls.dot}`} />
      {label}
    </span>
  );
}

/** Lote (`status` de `remote_action_batches`) → tono + etiqueta. */
export function batchStatusChip(status: string): { label: string; tone: StatusChipTone } {
  switch (status) {
    case 'sent': return { label: 'ENVIADO', tone: 'attention' };
    case 'completed': return { label: 'COMPLETADO', tone: 'neutral' };
    case 'completed_with_errors': return { label: 'COMPLETADO CON ERRORES', tone: 'severe' };
    case 'cancelled': return { label: 'CANCELADO', tone: 'muted' };
    default: return { label: 'PROGRAMADO', tone: 'idle' };
  }
}

/** Item del lote (`command_status`: success/error/pending/sent/null) → tono + etiqueta. */
export function itemStatusChip(commandStatus: string | null): { label: string; tone: StatusChipTone } {
  if (commandStatus === 'success') return { label: 'COMPLETADO', tone: 'neutral' };
  if (commandStatus === 'error') return { label: 'ERROR', tone: 'severe' };
  return { label: 'EN COLA', tone: 'attention' };
}
