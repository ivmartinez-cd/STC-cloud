import { Link } from 'react-router-dom';
import { fmt, formatRelativeTime } from '../../../../shared/lib/formatters';
import EstadoChip from '../../../../shared/components/EstadoChip';
import type { AgentDirectoryRow, SortDir } from '../../types/agentsDirectory';
import AgentRowActionsMenu from './AgentRowActionsMenu';

const GRID_COLS = 'grid-cols-[minmax(230px,1fr)_minmax(190px,1fr)_190px_116px_132px_128px_108px_40px]';

const ESTADO_LABEL: Record<AgentDirectoryRow['estado'], string> = {
  reportando: 'REPORTANDO', sin_senal: 'SIN SEÑAL', inactivo: 'INACTIVO',
};

function EstadoCell({ estado }: { estado: AgentDirectoryRow['estado'] }) {
  if (estado === 'reportando') return <EstadoChip label={ESTADO_LABEL.reportando} variant="neutral" />;
  if (estado === 'inactivo') return <EstadoChip label={ESTADO_LABEL.inactivo} variant="attention" dotClassName="bg-brand-severe" />;
  return <EstadoChip label={ESTADO_LABEL.sin_senal} variant="attention" />;
}

function SortableLastSeenHeader({ sortDir, onToggle }: { sortDir: SortDir; onToggle: () => void }) {
  return (
    <div role="columnheader" aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'} className="text-right">
      <button
        type="button"
        onClick={onToggle}
        className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600 transition-colors duration-150 ease-in-out hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        ÚLTIMA SEÑAL{sortDir === 'desc' ? ' ↓' : ' ↑'}
      </button>
    </div>
  );
}

function AgentRow({
  row, openMenu, onToggleMenu, onCloseMenu, onConfig, onRegen, onRevoke,
}: {
  row: AgentDirectoryRow;
  openMenu: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onConfig: () => void;
  onRegen: () => void;
  onRevoke: () => void;
}) {
  const notReporting = row.estado !== 'reportando';
  return (
    <div role="row" data-fit-row className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`}>
      <div role="cell" className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{row.name}</div>
        {/* Id interno del nodo (antes "Nodo ID: xxxxxxxx" en línea propia) — el
            hardware id tiene su PROPIA columna a la derecha, mostrarlo acá
            también sería redundante. */}
        <div className="truncate font-mono text-[11px] text-ink-300">{row.id.slice(0, 8)}</div>
      </div>

      <div role="cell" className="min-w-0">
        <div className="truncate font-sans text-[12.5px] text-ink-700">{row.client_name ?? 'Sin asignar'}</div>
        <Link to={`/clients/${row.client_id}`} className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
          VER EXPEDIENTE
        </Link>
      </div>

      <div role="cell" className="truncate font-mono text-[12px] text-ink-700">{row.hardware_id ?? '—'}</div>

      <div role="cell" className={`truncate font-mono text-[12px] ${row.version_stale ? 'text-brand-accent' : 'text-ink-700'}`}>
        {row.version ?? '—'}
      </div>

      <div role="cell"><EstadoCell estado={row.estado} /></div>

      <div role="cell" className={`text-right font-sans text-[12px] ${notReporting ? 'text-brand-accent' : 'text-ink-400'}`}>
        {formatRelativeTime(row.last_seen)}
      </div>

      <div role="cell" className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums">
        {row.device_count > 0 ? <span className="text-ink-900">{fmt(row.device_count)}</span> : <span className="text-ink-200">—</span>}
      </div>

      <div role="cell">
        <AgentRowActionsMenu agent={row} open={openMenu} onToggle={onToggleMenu} onClose={onCloseMenu} onConfig={onConfig} onRegen={onRegen} onRevoke={onRevoke} />
      </div>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
          <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-1/2 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
          <span className="h-3 w-2/5 justify-self-end animate-pulse rounded bg-surface-track" />
          <span />
        </div>
      ))}
    </>
  );
}

interface AgentsDirectoryTableProps {
  rows: AgentDirectoryRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  sortDir: SortDir;
  onToggleSort: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  openMenuId: string | null;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onConfig: (row: AgentDirectoryRow) => void;
  onRegen: (row: AgentDirectoryRow) => void;
  onRevoke: (row: AgentDirectoryRow) => void;
  skeletonRows?: number;
}

/** Tabla "Salud de nodos" (handoff hifi 25/08/2026) — CSS-grid-como-tabla-ARIA,
 * mismo patrón que `ClientsDirectoryTable.tsx`. Bugs que arregla (spec): un solo
 * header (antes duplicado entre `Agents.tsx` y este archivo), chip de 3 estados
 * en vez de un único "SIN SEÑAL" sin importar cuánto tiempo lleve caído, y sin
 * columna GESTIÓN (antes botones invisibles hasta hover) — acciones movidas al
 * menú del chevron. */
export default function AgentsDirectoryTable(props: AgentsDirectoryTableProps) {
  const { rows, loading, error, onRetry, sortDir, onToggleSort, hasActiveFilters, onClearFilters, openMenuId, onToggleMenu, onCloseMenu, onConfig, onRegen, onRevoke, skeletonRows = 10 } = props;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1260px]" role="table" aria-label="Salud de nodos">
        <div role="row" data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">NODO</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">CLIENTE</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">HARDWARE ID</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">VERSIÓN</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ESTADO</div>
          <SortableLastSeenHeader sortDir={sortDir} onToggle={onToggleSort} />
          <div role="columnheader" className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">EQUIPOS</div>
          <div role="columnheader" />
        </div>

        {error && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
            <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">
              Reintentar
            </button>
          </div>
        )}

        {!error && loading && <LoadingRows count={skeletonRows} />}

        {!error && !loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-300">Ningún nodo coincide con el filtro</span>
            {hasActiveFilters && (
              <button type="button" onClick={onClearFilters} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!error && !loading && rows.map((row) => (
          <AgentRow
            key={row.id}
            row={row}
            openMenu={openMenuId === row.id}
            onToggleMenu={() => onToggleMenu(row.id)}
            onCloseMenu={onCloseMenu}
            onConfig={() => { onCloseMenu(); onConfig(row); }}
            onRegen={() => { onCloseMenu(); onRegen(row); }}
            onRevoke={() => { onCloseMenu(); onRevoke(row); }}
          />
        ))}
      </div>
    </div>
  );
}
