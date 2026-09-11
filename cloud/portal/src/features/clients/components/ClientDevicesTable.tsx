import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fmt } from '../../../shared/lib/formatters';
import EstadoChip from '../../../shared/components/EstadoChip';
import TonerLevelBars from '../../../shared/components/TonerLevelBars';
import type { ClientDeviceDirectoryRow, ClientDeviceSortField, SortDir } from '../types/clientDetail';

const GRID_COLS = 'grid-cols-[minmax(260px,1fr)_132px_190px_130px_90px_96px_40px]';

const SORTABLE_HEADERS: Array<{ field: ClientDeviceSortField; label: string }> = [
  { field: 'consumible_pct', label: 'CONSUMIBLES' },
  { field: 'alerts_count', label: 'ALERTAS' },
  { field: 'last_seen', label: 'ÚLT. REPORTE' },
];

function brandBadge(brand: string | null): string {
  return brand ? brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '—' : '—';
}

function formatLastReport(iso: string | null): string {
  if (!iso) return 'sin reporte';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} d`;
}

const ESTADO_LABEL: Record<ClientDeviceDirectoryRow['estado'], string> = {
  en_linea: 'EN LÍNEA', sin_conexion: 'SIN CONEXIÓN', sin_reporte: 'SIN REPORTE',
};

function AlertsCell({ count }: { count: number }) {
  if (count === 0) return <div className="text-right font-montserrat text-[12.5px] font-semibold text-ink-200">—</div>;
  const cls = count >= 8 ? 'text-brand-severe' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{fmt(count)}</div>;
}

function SortableHeader({
  label, field, active, dir, onToggle,
}: {
  label: string; field: ClientDeviceSortField; active: boolean; dir: SortDir; onToggle: (f: ClientDeviceSortField) => void;
}) {
  return (
    <div role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-right">
      <button
        type="button"
        onClick={() => onToggle(field)}
        className={`font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
          active ? 'text-ink-600' : 'text-ink-300 hover:text-ink-100'
        }`}
      >
        {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </div>
  );
}

/** Tabla "Infraestructura de monitoreo" (handoff hifi "Cliente — detalle",
 * 25/08/2026) — mismo patrón/mecánica que `ClientsDirectoryTable.tsx` del listado
 * de Clientes, aplicado a los DISPOSITIVOS de un cliente puntual. */
export default function ClientDevicesTable({
  rows, loading, error, onRetry, sortField, sortDir, onToggleSort, hasActiveFilters, onClearFilters, skeletonRows = 10,
}: {
  rows: ClientDeviceDirectoryRow[]; skeletonRows?: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
  sortField: ClientDeviceSortField;
  sortDir: SortDir;
  onToggleSort: (f: ClientDeviceSortField) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const location = useLocation();
  const backState = { clientFrom: `${location.pathname}${location.search}` };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]" role="table" aria-label="Infraestructura de monitoreo">
        <div role="row" data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">DISPOSITIVO</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ESTADO</div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">UBICACIÓN</div>
          {SORTABLE_HEADERS.map((h) => (
            <SortableHeader key={h.field} label={h.label} field={h.field} active={sortField === h.field} dir={sortDir} onToggle={onToggleSort} />
          ))}
          <div role="columnheader" />
        </div>

        {error && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
            <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
          </div>
        )}

        {!error && loading && (
          Array.from({ length: skeletonRows }).map((_, i) => (
            <div key={i} className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px]`} style={{ height: 54 }}>
              <span className="h-3 w-3/5 animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-2/5 animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-1/2 animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-2/5 justify-self-end animate-pulse rounded bg-surface-track" />
              <span />
            </div>
          ))
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-300">Ningún dispositivo coincide con el filtro</span>
            {hasActiveFilters && (
              <button type="button" onClick={onClearFilters} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!error && !loading && rows.map((d) => (
          <Link
            key={d.id}
            to={`/devices/${d.id}`}
            state={backState}
            role="row" data-fit-row
            className={`group grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
          >
            <div role="cell" className="flex min-w-0 items-center gap-3">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[9px] font-bold text-ink-400">
                {brandBadge(d.brand)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{d.model ?? d.name ?? 'Equipo'}</div>
                <div className="truncate font-sans text-[11px] text-ink-300">Serie {d.serial_number ?? '—'}</div>
              </div>
            </div>

            <EstadoChip variant={d.estado === 'en_linea' ? 'neutral' : 'attention'} label={ESTADO_LABEL[d.estado]} />
            <div className="min-w-0 truncate font-sans text-[12.5px] text-ink-700">{d.location ?? '—'}</div>
            <TonerLevelBars black={d.toner_black} cyan={d.toner_cyan} magenta={d.toner_magenta} yellow={d.toner_yellow} />
            <AlertsCell count={d.alerts_count} />
            <div className="text-right font-sans text-[12px] text-ink-400">{formatLastReport(d.last_seen)}</div>

            <div className="flex justify-end">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out group-hover:border-line-300 group-hover:text-ink-100">
                <ChevronRight size={13} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
