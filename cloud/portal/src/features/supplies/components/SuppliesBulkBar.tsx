import { BTN_PRIMARY_SM } from '../../../shared/lib/buttons';

interface Props {
  count: number;
  busy: boolean;
  onGenerate: () => void;
  onClear: () => void;
}

/** Barra de acciones masivas de Consumibles (handoff hifi #3, fase 3,
 * 26/08/2026): sólo `GENERAR PEDIDO` es real (`POST /supply-requests`, uno
 * por ítem seleccionado). El mockup también muestra `MARCAR COMO PEDIDO` y
 * `POSPONER` — ninguna de las dos tiene concepto en el backend (no hay
 * "marcar externo" ni snooze sobre un consumible), así que no se fabrican;
 * mismo criterio que `SILENCIAR 24 H` en Alertas. */
export default function SuppliesBulkBar({ count, busy, onGenerate, onClear }: Props) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-chip-border bg-brand-soft px-5 py-3">
      <span className="whitespace-nowrap font-sans text-[11.5px] font-semibold text-brand-accent">
        {count} ítem{count === 1 ? '' : 's'} seleccionado{count === 1 ? '' : 's'}
      </span>
      <button type="button" onClick={onGenerate} disabled={busy} className={BTN_PRIMARY_SM}>{busy ? 'GENERANDO…' : 'GENERAR PEDIDO'}</button>
      <div className="flex-1" />
      <button type="button" onClick={onClear} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
        LIMPIAR SELECCIÓN
      </button>
    </div>
  );
}
