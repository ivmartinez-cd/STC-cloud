import SearchInput from '../../../../shared/components/SearchInput';
import SegmentChips from '../../../../shared/components/SegmentChips';

export type OperatorFilter = 'todos' | 'administradores' | 'suspendidos';

const OPTIONS: Array<{ value: OperatorFilter; label: string }> = [
  { value: 'todos', label: 'TODOS' },
  { value: 'administradores', label: 'ADMINISTRADORES' },
  { value: 'suspendidos', label: 'SUSPENDIDOS' },
];

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  filter: OperatorFilter;
  onFilterChange: (v: OperatorFilter) => void;
}

/** Handoff hifi #3, fase 2, 26/08/2026 — el mockup suma un 4to chip
 * `SIN ACCESO 30 D`, que necesita `last_login` (no existe todavía en `users`,
 * ver nota en `OperatorsTable.tsx`) — se deja afuera hasta que ese dato exista
 * de verdad, en vez de un chip que filtra sobre nada. */
export default function OperatorsFilterBar({ query, onQueryChange, filter, onFilterChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 px-5 py-3.5">
      <SearchInput value={query} onChange={onQueryChange} placeholder="Buscar operador por usuario…" />
      <SegmentChips options={OPTIONS} active={filter} onChange={onFilterChange} />
    </div>
  );
}
