import { Search } from 'lucide-react';
import type { ClientOption } from '../../../shared/components/DeviceLifecycleModals/types';
import type { PendingQueueSegment, SortDir } from '../types/pendingDevices';

const SEGMENT_OPTIONS: Array<{ value: PendingQueueSegment; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'posibles_duplicados', label: 'POSIBLES DUPLICADOS' },
  { value: 'mas_7_dias', label: '+7 DÍAS' },
  { value: 'sin_cliente', label: 'SIN CLIENTE' },
];

function SearchInput({ query, onQueryChange }: { query: string; onQueryChange: (v: string) => void }) {
  return (
    <div className="relative min-w-[260px] max-w-[420px] flex-1">
      <Search size={11} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a9aeb0]" />
      <input
        type="text" value={query} onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar por serie, IP, hostname o modelo…"
        className="w-full rounded-[3px] border border-line-100 bg-surface-input py-[9px] pl-8 pr-3 font-sans text-[12.5px] text-ink-900 outline-none placeholder:text-ink-300 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      />
    </div>
  );
}

function ClientSelect({ clientId, clients, onClientChange }: { clientId: string; clients: ClientOption[]; onClientChange: (v: string) => void }) {
  return (
    <select
      value={clientId} onChange={(e) => onClientChange(e.target.value)}
      className="min-w-[210px] rounded-[3px] border border-line-100 bg-surface-input px-3 py-[9px] font-sans text-[12.5px] text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <option value="">Todos los clientes</option>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function SegmentChip({ opt, active, onClick }: { opt: { value: PendingQueueSegment; label: string }; active: boolean; onClick: () => void }) {
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

function SegmentChips({ segment, onSegmentChange }: { segment: PendingQueueSegment; onSegmentChange: (v: PendingQueueSegment) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SEGMENT_OPTIONS.map((opt) => (
        <SegmentChip key={opt.value} opt={opt} active={segment === opt.value} onClick={() => onSegmentChange(opt.value)} />
      ))}
    </div>
  );
}

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  clientId: string;
  clients: ClientOption[];
  onClientChange: (v: string) => void;
  segment: PendingQueueSegment;
  onSegmentChange: (v: PendingQueueSegment) => void;
  sortDir: SortDir;
}

/** Barra de filtros (handoff hifi "Dispositivos pendientes", 25/08/2026): buscador
 * debounced + cliente (FILTRO opcional, no gate — bug arreglado) + chips de
 * segmento + rótulo de orden. Subcomponentes en el mismo archivo por el límite
 * de 20 líneas/función. */
export default function PendingQueueFilterBar({ query, onQueryChange, clientId, clients, onClientChange, segment, onSegmentChange, sortDir }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput query={query} onQueryChange={onQueryChange} />
      <ClientSelect clientId={clientId} clients={clients} onClientChange={onClientChange} />
      <SegmentChips segment={segment} onSegmentChange={onSegmentChange} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por antigüedad · {sortDir}</div>
    </div>
  );
}
