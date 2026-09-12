import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { fmt } from '../../../shared/lib/formatters';
import type { ClientDirectoryRow, ClientSortField, SortDir } from '../types/clientsDirectory';

const GRID_COLS = 'grid-cols-[minmax(280px,1fr)_138px_190px_84px_96px_84px_106px_36px]';

const SORTABLE_HEADERS: Array<{ field: ClientSortField; label: string; align: 'right' }> = [
  { field: 'monitor_count', label: 'MONITORES', align: 'right' },
  { field: 'device_count', label: 'EQUIPOS', align: 'right' },
  { field: 'alerts_count', label: 'ALERTAS', align: 'right' },
  { field: 'last_report_at', label: 'ÚLT. REPORTE', align: 'right' },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** "hace N min/h/d" — mismo estilo que la muestra del handoff (minúsculas, sin
 * fecha completa para reportes viejos, a diferencia de `formatRelativeTime`
 * compartido que usa mayúscula inicial y cae a fecha larga después de 24h). */
function formatLastReport(iso: string | null): string {
  if (!iso) return 'sin reporte';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `hace ${days} d`;
}

function EstadoChip({ estado }: { estado: ClientDirectoryRow['estado'] }) {
  if (estado === 'activo') {
    return (
      <span className="inline-flex items-center gap-[6px] justify-self-start rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
        <span className="block h-1.5 w-1.5 rounded-full bg-brand-gray" />
        ACTIVO
      </span>
    );
  }
  const label = estado === 'sin_contacto' ? 'SIN CONTACTO' : 'SIN REPORTE';
  return (
    <span className="inline-flex items-center gap-[6px] justify-self-start rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
      <span className="block h-1.5 w-1.5 rounded-full bg-brand" />
      {label}
    </span>
  );
}

function AlertsCell({ count }: { count: number }) {
  if (count === 0) return <div className="text-right font-montserrat text-[12.5px] font-semibold text-ink-200">—</div>;
  const cls = count > 50 ? 'text-brand-severe' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{fmt(count)}</div>;
}

function SortableHeader({
  label, field, active, dir, onToggle,
}: {
  label: string; field: ClientSortField; active: boolean; dir: SortDir; onToggle: (f: ClientSortField) => void;
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

export default function ClientsDirectoryTable({
  rows, loading, error, onRetry, maxDeviceCount, sortField, sortDir, onToggleSort, hasActiveFilters, onClearFilters, skeletonRows = 9,
}: {
  rows: ClientDirectoryRow[];
  skeletonRows?: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
  maxDeviceCount: number;
  sortField: ClientSortField;
  sortDir: SortDir;
  onToggleSort: (f: ClientSortField) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  // `from` = esta URL completa (filtros/orden/página): el breadcrumb "Clientes" de la
  // ficha vuelve exactamente acá (mismo mecanismo que `ClientDevicesTable`).
  const { pathname, search } = useLocation();
  const from = encodeURIComponent(pathname + search);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]" role="table" aria-label="Clientes">
        <div role="row" data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">
            INFORMACIÓN DEL CLIENTE
          </div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">
            ESTADO OPERATIVO
          </div>
          <div role="columnheader" className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">
            CONTACTO DIRECTO
          </div>
          {SORTABLE_HEADERS.map((h) => (
            <SortableHeader key={h.field} label={h.label} field={h.field} active={sortField === h.field} dir={sortDir} onToggle={onToggleSort} />
          ))}
          <div role="columnheader" />
        </div>

        {error && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar la cartera</span>
            <button
              type="button"
              onClick={onRetry}
              className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            >
              Reintentar
            </button>
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
              <span className="h-3 w-3/5 justify-self-end animate-pulse rounded bg-surface-track" />
              <span />
            </div>
          ))
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
            <span className="font-sans text-[12.5px] text-ink-300">Ningún cliente coincide con el filtro</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!error && !loading && rows.map((r) => {
          const barPct = maxDeviceCount > 0 ? Math.max(4, Math.round((r.device_count / maxDeviceCount) * 100)) : 0;
          return (
            <Link
              key={r.id}
              to={`/clients/${r.id}?from=${from}`}
              role="row"
              data-fit-row
              className={`group grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}
            >
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-line-avatar bg-surface-avatar font-montserrat text-[10.5px] font-bold text-ink-400">
                  {initialsOf(r.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-[13px] font-semibold text-ink-900">{r.name}</div>
                  <div className="truncate font-sans text-[11px] text-ink-300">{fmt(r.device_count)} equipos · {fmt(r.monitor_count)} monitores</div>
                </div>
              </div>

              <EstadoChip estado={r.estado} />

              <div className="min-w-0 truncate font-sans text-[12.5px]">
                {r.contact_name
                  ? <span className="text-ink-700">{r.contact_name}{r.contact_email ? ` · ${r.contact_email}` : ''}</span>
                  : <span className="text-ink-200">Sin asignar</span>}
              </div>

              <div className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-600">{fmt(r.monitor_count)}</div>

              <div className="flex items-center justify-end gap-2">
                <span className="block h-1.5 w-10 overflow-hidden rounded-[3px] bg-surface-track">
                  <span className="block h-full rounded-[3px] bg-brand-gray" style={{ width: `${barPct}%` }} />
                </span>
                <span className="min-w-[30px] text-right font-montserrat text-[12.5px] font-bold tabular-nums text-ink-900">{fmt(r.device_count)}</span>
              </div>

              <AlertsCell count={r.alerts_count} />

              <div className="text-right font-sans text-[12px] text-ink-400">{formatLastReport(r.last_report_at)}</div>

              <div className="flex justify-end">
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line-avatar text-ink-300 transition-colors duration-150 ease-in-out group-hover:border-line-300 group-hover:text-ink-100">
                  <ChevronRight size={13} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
