import { Link } from 'react-router-dom';
import type { Incident } from '../../../shared/types/incidents';
import EstadoChip from '../../../shared/components/EstadoChip';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { GRID_COLS, TABLE_MIN_WIDTH } from './incidentsGrid';
import { agingColorClass, classAccent, fmtAging, originChipProps, statusChipProps } from '../lib/incidentPresentation';

const HEAD_LABELS = ['Nº', 'TÍTULO Y EQUIPO', 'CLIENTE', 'CLASE', 'ORIGEN', 'ESTADO'];

function TitleAndEquipmentCell({ inc }: { inc: Incident }) {
  const eq = inc.device_label || inc.device_serial;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`block h-[26px] w-[3px] shrink-0 ${classAccent(inc.class)}`} />
      <div className="min-w-0">
        <div className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{inc.title}</div>
        <div className={`truncate font-sans text-[11px] ${eq ? 'text-ink-300' : 'text-brand-accent'}`}>{eq || 'Sin equipo asociado'}</div>
      </div>
    </div>
  );
}

function ClassChip({ inc, classLabels }: { inc: Incident; classLabels: Record<string, string> }) {
  return (
    <span className="inline-flex items-center gap-[7px] justify-self-start rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
      <span className={`block h-1.5 w-1.5 rounded-full ${classAccent(inc.class)}`} /> {classLabels[inc.class] ?? inc.class}
    </span>
  );
}

function AgingCell({ inc }: { inc: Incident }) {
  return (
    <span className={`text-right font-montserrat text-[12.5px] font-semibold tabular-nums ${agingColorClass(Number(inc.aging_seconds), inc.status)}`}>
      {fmtAging(inc.aging_seconds)}
    </span>
  );
}

function Row({ inc, classLabels }: { inc: Incident; classLabels: Record<string, string> }) {
  const status = statusChipProps(inc.status);
  const origin = originChipProps(inc.origin);
  return (
    <Link
      to={`/incidents/${inc.id}`}
      role="row" data-fit-row
      className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] hover:bg-surface-btn-hover`}
      style={{ height: 54 }}
    >
      <span className="font-mono text-[12px] font-medium text-brand-accent">#{inc.number}</span>
      <TitleAndEquipmentCell inc={inc} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{inc.client_name || '—'}</span>
      <ClassChip inc={inc} classLabels={classLabels} />
      <EstadoChip label={origin.label} variant={origin.variant} />
      <EstadoChip label={status.label} variant={status.variant} />
      <AgingCell inc={inc} />
      <span className="justify-self-end font-sans text-[13px] text-ink-200">›</span>
    </Link>
  );
}

interface Props {
  items: Incident[];
  classLabels: Record<string, string>;
  loading: boolean;
  error: string;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  skeletonRows?: number;
}

function TableHead() {
  return (
    <div data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-avatar px-5 py-3`}>
      {HEAD_LABELS.map((h) => <span key={h} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{h}</span>)}
      <span className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-600">ANTIG. ↓</span>
      <span />
    </div>
  );
}

function TableBody({ items, classLabels, loading, error, hasActiveFilters, onRetry, onClearFilters, skeletonRows = 8 }: Props) {
  if (error) return <TableErrorState message={error} onRetry={onRetry} />;
  if (loading) return <>{Array.from({ length: skeletonRows }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={['w-2/3', 'w-3/4', 'w-2/3', 'w-1/2', 'w-1/2', 'w-1/2', '', '']} />)}</>;
  if (items.length === 0) return <TableEmptyState message="Sin incidentes" hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />;
  return <>{items.map((inc) => <Row key={inc.id} inc={inc} classLabels={classLabels} />)}</>;
}

/** Tabla densa de Incidentes (handoff hifi #3, fase 4) — filas de 54px, mismo
 * molde que las tablas hifi anteriores. */
export default function IncidentsTable(props: Props) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: TABLE_MIN_WIDTH }}>
        <TableHead />
        <TableBody {...props} />
      </div>
    </div>
  );
}
