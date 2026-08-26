import SearchInput from '../../../shared/components/SearchInput';
import SegmentChips from '../../../shared/components/SegmentChips';
import type { StatusFilter } from '../hooks/useEmailLogPage';

const OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'skipped_no_transport', label: 'SIN SMTP' },
  { value: 'skipped_no_recipient', label: 'SIN DESTINATARIO' },
  { value: 'sent', label: 'ENTREGADOS' },
];

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
}

/** Barra de filtros de Correo (handoff hifi #3, 26/08/2026): buscador + 4 chips
 * de segmento único (`TODOS`/`SIN SMTP`/`SIN DESTINATARIO`/`ENTREGADOS`) sobre
 * `status` — a diferencia de Alertas, acá SÍ es selección única (un intento
 * tiene un solo estado), por eso reusa `shared/SegmentChips` tal cual. */
export default function EmailLogFilterBar({ query, onQueryChange, status, onStatusChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput value={query} onChange={onQueryChange} placeholder="Buscar destinatario, asunto o cliente…" />
      <SegmentChips options={OPTIONS} active={status} onChange={onStatusChange} />
      <div className="ml-auto font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-300">Ordenado por fecha · desc</div>
    </div>
  );
}
