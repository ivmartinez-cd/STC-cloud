import { CheckSquare, Square } from 'lucide-react';
import { GRID_COLS } from './pendingQueueGrid';
import PendingQueueRow from './PendingQueueRow';
import type { PendingQueueRow as Row, SortDir } from '../types/pendingDevices';

const HEAD_LABELS = ['EQUIPO DESCUBIERTO', 'CLIENTE SUGERIDO', 'DIRECCIÓN IP', 'DETECTADO POR', 'REVISIÓN'];

function SortableWaitHeader({ sortDir, onToggleSort }: { sortDir: SortDir; onToggleSort: () => void }) {
  return (
    <div role="columnheader" aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'} className="text-right">
      <button
        type="button" onClick={onToggleSort}
        className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600 transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        EN ESPERA{sortDir === 'desc' ? ' ↓' : ' ↑'}
      </button>
    </div>
  );
}

function HeaderRow({ sortDir, onToggleSort, allSelected, onToggleAll }: {
  sortDir: SortDir; onToggleSort: () => void; allSelected: boolean; onToggleAll: () => void;
}) {
  return (
    <div role="row" className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      <button type="button" onClick={onToggleAll} className="justify-self-start text-ink-300 hover:text-ink-100" title="Seleccionar todos">
        {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>
      {HEAD_LABELS.map((label) => (
        <div key={label} role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{label}</div>
      ))}
      <SortableWaitHeader sortDir={sortDir} onToggleSort={onToggleSort} />
      <div role="columnheader" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
          <span />
          <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-1/2 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 justify-self-end animate-pulse rounded bg-surface-track" />
        </div>
      ))}
    </>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar la cola de pendientes</span>
      <button
        type="button" onClick={onRetry}
        className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        Reintentar
      </button>
    </div>
  );
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
      <span className="font-sans text-[12.5px] text-ink-300">
        {hasActiveFilters ? 'Ningún equipo pendiente coincide con el filtro' : 'No hay equipos esperando aprobación'}
      </span>
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

interface Props {
  rows: Row[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  sortDir: SortDir;
  onToggleSort: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  selected: Set<string>;
  allSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onRowAction: (row: Row) => void;
}

/** Tabla de la cola (handoff hifi "Dispositivos pendientes", 25/08/2026) —
 * CSS-grid-como-tabla-ARIA, plana (sin agrupar por cliente, a diferencia del
 * inventario global). Subcomponentes en archivos propios por el límite de 20
 * líneas/función de la guía. */
export default function PendingQueueTable({
  rows, loading, error, onRetry, sortDir, onToggleSort, hasActiveFilters, onClearFilters,
  selected, allSelected, onToggleRow, onToggleAll, onRowAction,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1240px]" role="table" aria-label="Dispositivos pendientes">
        <HeaderRow sortDir={sortDir} onToggleSort={onToggleSort} allSelected={allSelected} onToggleAll={onToggleAll} />
        {error && <ErrorState onRetry={onRetry} />}
        {!error && loading && <LoadingSkeleton />}
        {!error && !loading && rows.length === 0 && <EmptyState hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />}
        {!error && !loading && rows.map((row) => (
          <PendingQueueRow key={row.id} row={row} selected={selected.has(row.id)} onToggle={() => onToggleRow(row.id)} onAction={onRowAction} />
        ))}
      </div>
    </div>
  );
}
