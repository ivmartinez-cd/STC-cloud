import { ChevronRight } from 'lucide-react';
import { fmt, formatShortDateTime } from '../../../../shared/lib/formatters';
import {
  ACTION_ACCENT_COLOR, ACTION_LABELS, ACTION_SUBTITLES,
  type RemoteActionBatchRow, type SortDir,
} from '../../types/remoteActions';
import StatusChip, { batchStatusChip } from './StatusChip';

const GRID_COLS = 'grid-cols-[76px_minmax(210px,1fr)_minmax(200px,1fr)_84px_146px_158px_146px_40px]';

function SortableProgramado({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  return (
    <div role="columnheader" aria-sort={dir === 'asc' ? 'ascending' : 'descending'} className="text-right">
      <button
        type="button" onClick={onToggle}
        className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600 transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        PROGRAMADO{dir === 'desc' ? ' ↓' : ' ↑'}
      </button>
    </div>
  );
}

const HEADER_CLS = 'font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300';

function HeaderRow({ sortDir, onToggleSort }: { sortDir: SortDir; onToggleSort: () => void }) {
  return (
    <div role="row" className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      <div role="columnheader" className={HEADER_CLS}>LOTE</div>
      <div role="columnheader" className={HEADER_CLS}>ACCIÓN</div>
      <div role="columnheader" className={HEADER_CLS}>OBJETIVO</div>
      <div role="columnheader" className={`text-right ${HEADER_CLS}`}>ELEM.</div>
      <div role="columnheader" className={HEADER_CLS}>ESTADO</div>
      <SortableProgramado dir={sortDir} onToggle={onToggleSort} />
      <div role="columnheader" className={`text-right ${HEADER_CLS}`}>COMPLETADO</div>
      <div role="columnheader" />
    </div>
  );
}

function AccionCell({ action }: { action: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 block h-[26px] w-[3px] shrink-0 rounded-full" style={{ background: ACTION_ACCENT_COLOR[action] ?? 'var(--color-ink-500)' }} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{ACTION_LABELS[action] ?? action}</div>
        <div className="truncate font-sans text-[11px] text-ink-300">{ACTION_SUBTITLES[action] ?? ''}</div>
      </div>
    </div>
  );
}

function ObjetivoCell({ name }: { name: string | null }) {
  return (
    <div className="min-w-0 truncate font-sans text-[12.5px]">
      {name ? <span className="text-ink-700">{name}</span> : <span className="text-ink-200">Sin nombre de lote</span>}
    </div>
  );
}

function CompletadoCell({ completedAt }: { completedAt: string | null }) {
  return (
    <div className="text-right font-sans text-[12px] tabular-nums">
      {completedAt ? <span className="text-ink-600">{formatShortDateTime(completedAt)}</span> : <span className="text-ink-200">—</span>}
    </div>
  );
}

function ChevronCell() {
  return (
    <div className="flex justify-end">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out group-hover:border-line-300 group-hover:text-ink-100">
        <ChevronRight size={13} />
      </span>
    </div>
  );
}

function Row({ b, onClick }: { b: RemoteActionBatchRow; onClick: () => void }) {
  const chip = batchStatusChip(b.status);
  return (
    <div
      role="row" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className={`group grid ${GRID_COLS} min-h-[54px] cursor-pointer items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
    >
      <div role="cell" className="font-mono text-[12px] text-brand-accent">#{b.number}</div>
      <div role="cell"><AccionCell action={b.action} /></div>
      <div role="cell"><ObjetivoCell name={b.name} /></div>
      <div role="cell" className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-600">{fmt(b.total_items ?? 0)}</div>
      <div role="cell"><StatusChip label={chip.label} tone={chip.tone} /></div>
      <div role="cell" className="text-right font-sans text-[12px] tabular-nums text-ink-600">{formatShortDateTime(b.scheduled_at)}</div>
      <div role="cell"><CompletadoCell completedAt={b.completed_at} /></div>
      <div role="cell"><ChevronCell /></div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
          {Array.from({ length: 8 }).map((__, j) => (
            <span key={j} className={`h-3 animate-pulse rounded bg-surface-track ${j >= 3 ? 'justify-self-end' : ''} ${j === 1 ? 'w-4/5' : 'w-3/5'}`} />
          ))}
        </div>
      ))}
    </>
  );
}

function TableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
      <button
        type="button" onClick={onRetry}
        className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        Reintentar
      </button>
    </div>
  );
}

function TableEmpty({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-300">Ningún lote coincide con el filtro</span>
      {hasActiveFilters && (
        <button
          type="button" onClick={onClearFilters}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Tabla de lotes de "Acciones remotas" (handoff hifi "4 pantallas") —
 * CSS-grid-como-tabla-ARIA, mismo patrón que `ClientsDirectoryTable`. */
export default function RemoteActionsTable({
  rows, loading, error, onRetry, sortDir, onToggleSort, onRowClick, hasActiveFilters, onClearFilters,
}: {
  rows: RemoteActionBatchRow[]; loading: boolean; error: string; onRetry: () => void;
  sortDir: SortDir; onToggleSort: () => void; onRowClick: (b: RemoteActionBatchRow) => void;
  hasActiveFilters: boolean; onClearFilters: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1240px]" role="table" aria-label="Lotes de acciones remotas">
        <HeaderRow sortDir={sortDir} onToggleSort={onToggleSort} />
        {error && <TableError onRetry={onRetry} />}
        {!error && loading && <LoadingRows />}
        {!error && !loading && rows.length === 0 && <TableEmpty hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />}
        {!error && !loading && rows.map((b) => <Row key={b.id} b={b} onClick={() => onRowClick(b)} />)}
      </div>
    </div>
  );
}
