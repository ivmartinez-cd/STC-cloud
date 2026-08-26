import { Search } from 'lucide-react';
import type { DeviceDirectorySegment } from '../types/deviceDirectory';

const SEGMENT_OPTIONS: Array<{ value: DeviceDirectorySegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'sin_contacto', label: 'SIN CONTACTO' },
  { value: 'con_alertas', label: 'CON ALERTAS' },
  { value: 'consumible_bajo', label: 'CONSUMIBLE BAJO' },
  { value: 'sin_agente', label: 'SIN AGENTE' },
];

function SearchInput({ query, onQueryChange }: { query: string; onQueryChange: (v: string) => void }) {
  return (
    <div className="relative min-w-[260px] max-w-[440px] flex-1">
      <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
      <input
        type="text" value={query} onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filtrar por IP, serie, marca, modelo o cliente…"
        className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      />
    </div>
  );
}

function SegmentChip({ opt, active, onClick }: { opt: { value: DeviceDirectorySegment; label: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
        active ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {opt.label}
    </button>
  );
}

function SegmentChips({ segment, onSegmentChange }: { segment: DeviceDirectorySegment; onSegmentChange: (v: DeviceDirectorySegment) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SEGMENT_OPTIONS.map((opt) => (
        <SegmentChip key={opt.value} opt={opt} active={segment === opt.value} onClick={() => onSegmentChange(opt.value)} />
      ))}
    </div>
  );
}

function DecommissionedCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap font-sans text-[11.5px] text-ink-400 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
      Mostrar dados de baja
    </label>
  );
}

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  segment: DeviceDirectorySegment;
  onSegmentChange: (v: DeviceDirectorySegment) => void;
  includeDecommissioned: boolean;
  onIncludeDecommissionedChange: (v: boolean) => void;
}

/** Barra de filtros (handoff hifi "Inventario de dispositivos", 25/08/2026): buscador
 * debounced + chips de segmento + "mostrar dados de baja" + rótulo de agrupado.
 * Subcomponentes en el mismo archivo para respetar el límite de 20 líneas/función. */
export default function DeviceInventoryFilterBar({
  query, onQueryChange, segment, onSegmentChange, includeDecommissioned, onIncludeDecommissionedChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput query={query} onQueryChange={onQueryChange} />
      <SegmentChips segment={segment} onSegmentChange={onSegmentChange} />
      <DecommissionedCheckbox checked={includeDecommissioned} onChange={onIncludeDecommissionedChange} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Agrupado por cliente</div>
    </div>
  );
}
