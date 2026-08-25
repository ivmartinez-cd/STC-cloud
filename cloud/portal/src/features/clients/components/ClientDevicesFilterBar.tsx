import { Search } from 'lucide-react';
import type { ClientDeviceSegment, ClientDeviceSortField, SortDir } from '../types/clientDetail';

const SEGMENT_OPTIONS: Array<{ value: ClientDeviceSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'sin_conexion', label: 'SIN CONEXIÓN' },
  { value: 'con_alertas', label: 'CON ALERTAS' },
  { value: 'consumible_bajo', label: 'CONSUMIBLE BAJO' },
];

const SORT_LABELS: Record<ClientDeviceSortField, string> = {
  alerts_count: 'alertas', consumible_pct: 'consumibles', last_seen: 'último reporte',
};

/** Barra de filtros de "Infraestructura de monitoreo" — mismo patrón que
 * `ClientsFilterBar.tsx` del listado de Clientes (handoff hifi "Cliente — detalle",
 * 25/08/2026), sólo cambian los chips de segmento. */
export default function ClientDevicesFilterBar({
  query, onQueryChange, segment, onSegmentChange, sortField, sortDir,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  segment: ClientDeviceSegment;
  onSegmentChange: (v: ClientDeviceSegment) => void;
  sortField: ClientDeviceSortField;
  sortDir: SortDir;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <div className="relative min-w-[240px] max-w-[400px] flex-1">
        <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por serie, modelo o ubicación…"
          className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SEGMENT_OPTIONS.map((opt) => {
          const active = segment === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSegmentChange(opt.value)}
              aria-pressed={active}
              className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
                active
                  ? 'border-brand-chip-border bg-brand-soft text-brand-accent'
                  : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto font-sans text-[11.5px] text-ink-300">
        Ordenado por {SORT_LABELS[sortField]} · {sortDir === 'desc' ? 'desc' : 'asc'}
      </div>
    </div>
  );
}
