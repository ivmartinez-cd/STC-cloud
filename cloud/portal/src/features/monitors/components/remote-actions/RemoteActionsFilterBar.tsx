import { Search } from 'lucide-react';
import type { RemoteActionSegment, SortDir } from '../../types/remoteActions';

const SEGMENT_OPTIONS: Array<{ value: RemoteActionSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'con_errores', label: 'CON ERRORES' },
  { value: 'en_curso', label: 'EN CURSO' },
  { value: 'cancelados', label: 'CANCELADOS' },
  { value: 'hoy', label: 'HOY' },
];

function SearchInput({ query, onQueryChange }: { query: string; onQueryChange: (v: string) => void }) {
  return (
    <div className="relative min-w-[260px] max-w-[400px] flex-1">
      <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
      <input
        type="text" value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Buscar por lote, acción o nombre…"
        className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      />
    </div>
  );
}

function SegmentChip({ opt, active, onSelect }: { opt: { value: RemoteActionSegment; label: string }; active: boolean; onSelect: (v: RemoteActionSegment) => void }) {
  return (
    <button
      type="button" onClick={() => onSelect(opt.value)} aria-pressed={active}
      className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
        active ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {opt.label}
    </button>
  );
}

/** Buscador + chips de segmento + indicador de orden (handoff hifi "Acciones
 * remotas") — mismo patrón que `ClientsFilterBar`. Único campo ordenable de
 * la tabla es PROGRAMADO, así que no hay selector de campo, sólo dirección. */
export default function RemoteActionsFilterBar({
  query, onQueryChange, segment, onSegmentChange, sortDir,
}: {
  query: string; onQueryChange: (v: string) => void;
  segment: RemoteActionSegment; onSegmentChange: (v: RemoteActionSegment) => void;
  sortDir: SortDir;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput query={query} onQueryChange={onQueryChange} />
      <div className="flex flex-wrap items-center gap-1.5">
        {SEGMENT_OPTIONS.map((opt) => <SegmentChip key={opt.value} opt={opt} active={segment === opt.value} onSelect={onSegmentChange} />)}
      </div>
      <div className="ml-auto font-sans text-[11.5px] text-ink-300">Ordenado por programado · {sortDir === 'desc' ? 'desc' : 'asc'}</div>
    </div>
  );
}
