import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { AuditLogItem } from '../../../shared/types/audit';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { GRID_COLS, TABLE_MIN_WIDTH } from './activityGrid';
import { categoryAccent, dayLabelOf, fmtTime, groupByDay, isRawId, targetHref, type DayGroup } from '../lib/activityPresentation';
import { fmt } from '../../../shared/lib/formatters';

const HEAD_LABELS = ['HORA ↓', 'ACCIÓN', 'OBJETIVO', 'CLIENTE', 'USUARIO', 'ORIGEN'];

function TargetCell({ item }: { item: AuditLogItem }) {
  const href = targetHref(item);
  const label = item.target_label || item.target_id;
  // Sin `target_label` legible, lo que se muestra es el id crudo → monoespaciada.
  const raw = !item.target_label && isRawId(item.target_id);
  const cls = `truncate ${raw ? 'font-mono text-[12px]' : 'font-sans text-[12.5px] font-semibold'} text-ink-900`;
  const kind = item.target_kind === 'device' ? 'Equipo' : item.target_kind === 'agent' ? 'Agente de red' : item.target_kind === 'client' ? 'Cliente' : raw ? 'Identificador interno' : '—';
  return (
    <div className="min-w-0">
      {href ? <Link to={href} onClick={(e) => e.stopPropagation()} className={`${cls} block hover:text-brand-accent hover:underline`}>{label ?? '—'}</Link>
        : <span className={`${cls} block`}>{label ?? '—'}</span>}
      <div className="truncate font-sans text-[11px] text-ink-300">{kind}</div>
    </div>
  );
}

function ActionCell({ item }: { item: AuditLogItem }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`block h-[22px] w-[3px] shrink-0 ${categoryAccent(item.category)}`} />
      <span className="truncate font-montserrat text-[11px] font-semibold uppercase tracking-[.07em] text-ink-700">{item.action_label}</span>
    </div>
  );
}

function MetadataPanel({ item }: { item: AuditLogItem }) {
  return (
    <div className="border-b border-line-200 bg-surface-avatar px-5 py-3">
      <pre className="whitespace-pre-wrap break-all font-mono text-[10.5px] text-ink-500">
        {item.metadata ? JSON.stringify(typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata, null, 2) : 'Sin metadata'}
      </pre>
    </div>
  );
}

function Row({ item, expanded, onToggle }: { item: AuditLogItem; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <div className={`grid ${GRID_COLS} cursor-pointer items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] hover:bg-surface-btn-hover`} style={{ height: 54 }} onClick={onToggle}>
        <span className="font-mono text-[12px] text-ink-600">{fmtTime(item.created_at)}</span>
        <ActionCell item={item} />
        <TargetCell item={item} />
        <span className={`truncate font-sans text-[12.5px] ${item.client_name ? 'text-ink-700' : 'text-ink-200'}`}>{item.client_name || 'Sin cliente'}</span>
        <span className={`truncate font-sans text-[12.5px] ${item.user_username ? 'text-ink-700' : 'text-ink-200'}`}>{item.user_username || 'Sistema'}</span>
        <span className={`truncate font-mono text-[11.5px] ${item.ip_address ? 'text-ink-700' : 'text-ink-200'}`}>{item.ip_address || 'Interno'}</span>
        <ChevronDown size={14} className={`justify-self-end text-ink-200 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && <MetadataPanel item={item} />}
    </>
  );
}

function DayHeader({ group }: { group: DayGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-150 bg-surface-avatar px-5 py-[10px]">
      <span className="font-montserrat text-[10px] font-bold uppercase tracking-[.12em] text-ink-900">{dayLabelOf(group.items[0].created_at)}</span>
      <span className="font-sans text-[11.5px] text-ink-300">{fmt(group.items.length)} eventos</span>
    </div>
  );
}

interface Props { items: AuditLogItem[]; loading: boolean; error: string; hasActiveFilters: boolean; onRetry: () => void; onClearFilters: () => void }

function TableColumnHead() {
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-avatar px-5 py-3`}>
      {HEAD_LABELS.map((h) => <span key={h} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{h}</span>)}
      <span />
    </div>
  );
}

function GroupedRows({ groups, expandedId, onToggle }: { groups: DayGroup[]; expandedId: string | null; onToggle: (id: string) => void }) {
  return (
    <>
      {groups.map((g) => (
        <Fragment key={g.key}>
          <DayHeader group={g} />
          {g.items.map((item) => <Row key={item.id} item={item} expanded={expandedId === item.id} onToggle={() => onToggle(item.id)} />)}
        </Fragment>
      ))}
    </>
  );
}

/** Tabla de Movimientos agrupada por día (handoff hifi #3, fase 5). */
export default function ActivityTable({ items, loading, error, hasActiveFilters, onRetry, onClearFilters }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  const groups = groupByDay(items);
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: TABLE_MIN_WIDTH }}>
        <TableColumnHead />
        {error ? <TableErrorState message={error} onRetry={onRetry} />
          : loading ? Array.from({ length: 8 }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={['w-1/2', 'w-2/3', 'w-3/4', 'w-1/2', 'w-1/2', 'w-1/2', '']} />)
          : items.length === 0 ? <TableEmptyState message="Sin movimientos" hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />
          : <GroupedRows groups={groups} expandedId={expandedId} onToggle={toggle} />}
      </div>
    </div>
  );
}
