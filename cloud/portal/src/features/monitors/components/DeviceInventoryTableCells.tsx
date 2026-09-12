import { fmt } from '../../../shared/lib/formatters';
import type { AgentDeviceSortField, SortDir } from '../types/monitorDetail';

export function AlertsCell({ count }: { count: number }) {
  if (count === 0) return <div className="text-right font-montserrat text-[12.5px] font-semibold text-ink-200">—</div>;
  const cls = count >= 5 ? 'text-severity-critical' : 'text-ink-600';
  return <div className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${cls}`}>{fmt(count)}</div>;
}

export function SortableHeader({ label, field, active, dir, onToggle }: {
  label: string; field: AgentDeviceSortField; active: boolean; dir: SortDir; onToggle: (f: AgentDeviceSortField) => void;
}) {
  return (
    <div role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-right">
      <button
        type="button" onClick={() => onToggle(field)}
        className={`font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] transition-colors duration-150 ease-in-out ${active ? 'text-ink-600' : 'text-ink-300 hover:text-ink-100'}`}
      >
        {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    </div>
  );
}
