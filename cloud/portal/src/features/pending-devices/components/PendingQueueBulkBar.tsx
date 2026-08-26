interface Props {
  count: number;
  acting: boolean;
  onApprove: () => void;
  onReassign: () => void;
  onMerge: () => void;
  onIgnore: () => void;
  onClear: () => void;
}

const BTN_SECONDARY = 'rounded-[3px] border border-line-300 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover disabled:opacity-50';
const BTN_PRIMARY = 'rounded-[3px] bg-brand px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe disabled:opacity-50';
const BTN_WARNING = 'rounded-[3px] border border-brand-chip-border bg-brand-soft px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-chip-border disabled:opacity-50';

/** Barra de acciones en bloque (handoff hifi "Dispositivos pendientes",
 * 25/08/2026) — a medida, no la `BulkActionBar` compartida: el handoff pide
 * "LIMPIAR SELECCIÓN" como link de texto, no el ícono ✕ que trae ese
 * componente. Fondo/borde `brand-soft`/`brand-chip-border`, mismo criterio
 * institucional que el resto de las barras de bloque del portal. */
export default function PendingQueueBulkBar({ count, acting, onApprove, onReassign, onMerge, onIgnore, onClear }: Props) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-chip-border bg-brand-soft px-5 py-3">
      <span className="whitespace-nowrap font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
        {count} equipo{count === 1 ? '' : 's'} seleccionado{count === 1 ? '' : 's'}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApprove} disabled={acting} className={BTN_PRIMARY}>APROBAR</button>
        <button type="button" onClick={onReassign} disabled={acting} className={BTN_SECONDARY}>REASIGNAR CLIENTE</button>
        <button type="button" onClick={onMerge} disabled={acting} className={BTN_SECONDARY}>FUSIONAR CON EXISTENTE</button>
        <button type="button" onClick={onIgnore} disabled={acting} className={BTN_WARNING}>IGNORAR</button>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onClear} className="whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
        LIMPIAR SELECCIÓN
      </button>
    </div>
  );
}
