import { Search } from 'lucide-react';
import type { AgentSegment, SortDir } from '../../types/agentsDirectory';

const SEGMENT_OPTIONS: Array<{ value: AgentSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'sin_senal', label: 'SIN SEÑAL' },
  { value: 'desactualizados', label: 'DESACTUALIZADOS' },
  { value: 'llave_por_vencer', label: 'LLAVE POR VENCER' },
];

/** Barra de filtros (handoff hifi "Salud de nodos"): buscador debounced + chips
 * de segmento mutuamente excluyentes + indicador de orden actual — un solo
 * campo ordenable acá (última señal), a diferencia de Clientes. */
export default function AgentsFilterBar({
  query, onQueryChange, segment, onSegmentChange, sortDir,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  segment: AgentSegment;
  onSegmentChange: (v: AgentSegment) => void;
  sortDir: SortDir;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <div className="relative min-w-[260px] max-w-[420px] flex-1">
        <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por nodo, cliente o hardware id…"
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
        Ordenado por última señal · {sortDir === 'desc' ? 'desc' : 'asc'}
      </div>
    </div>
  );
}
