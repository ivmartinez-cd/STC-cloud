import { useState } from 'react';
import { Link } from 'react-router-dom';
import EstadoChip from '../../../shared/components/EstadoChip';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';
import { GRID_COLS, TABLE_MIN_WIDTH } from './reportsGrid';
import { displayDelta, fmtDate, fmtInt, type ReportRow } from '../lib/reportsPresentation';

type Filter = 'all' | 'anomaly' | 'zero';

const HEAD_LABELS = ['EQUIPO', 'LECTURA INICIAL', 'LECTURA FINAL', 'DELTA ↓', 'MONO', 'FUENTE', 'OBSERVACIÓN'];

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-[3px] border px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] transition-colors duration-150 ease-in-out ${
        active ? 'border-brand-chip-border bg-brand-soft text-brand-accent' : 'border-line-100 bg-white text-ink-100 hover:bg-surface-btn-hover'
      }`}
    >
      {label}
    </button>
  );
}

function TableHeader({ period, rows, filter, onFilter }: { period: string; rows: ReportRow[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const anomalies = rows.filter((r) => r.hadCounterReset).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-150 px-5 py-[14px]">
      <div>
        <div className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">DETALLE POR EQUIPO · {period}</div>
        <div className="mt-[5px] font-sans text-[11.5px] text-ink-300">
          {fmtInt(rows.length)} equipos facturables{anomalies > 0 ? ` · ${fmtInt(anomalies)} con anomalía de contador` : ''}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label="TODOS" active={filter === 'all'} onClick={() => onFilter('all')} />
        <FilterChip label="CON ANOMALÍA" active={filter === 'anomaly'} onClick={() => onFilter('anomaly')} />
        <FilterChip label="DELTA 0" active={filter === 'zero'} onClick={() => onFilter('zero')} />
      </div>
    </div>
  );
}

function ReadingCell({ total, at }: { total: number | null; at: string | null }) {
  return (
    <div className="text-right">
      <div className="font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{total != null ? fmtInt(total) : '—'}</div>
      <div className="font-sans text-[10.5px] text-ink-300">{fmtDate(at)}</div>
    </div>
  );
}

function EquipmentCell({ row }: { row: ReportRow }) {
  return (
    <div className="min-w-0">
      {row.deviceId
        ? <Link to={`/devices/${row.deviceId}`} className="truncate block font-sans text-[12.5px] font-semibold text-ink-900 hover:text-brand-accent hover:underline">{row.model || row.serial || 'Equipo'}</Link>
        : <span className="truncate block font-sans text-[12.5px] font-semibold text-ink-900">{row.model || row.serial || 'Equipo'}</span>}
      <div className="truncate font-mono text-[11px] text-ink-300">{row.serial ?? '—'}</div>
    </div>
  );
}

function Row({ row }: { row: ReportRow }) {
  const delta = displayDelta(row);
  const deltaColor = row.hadCounterReset ? 'text-brand-severe' : delta === 0 ? 'text-ink-200' : 'text-ink-900';
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] ${row.hadCounterReset ? 'bg-brand-soft/40' : ''}`} style={{ height: 54 }}>
      <EquipmentCell row={row} />
      <ReadingCell total={row.firstTotal} at={row.firstAt} />
      <ReadingCell total={row.lastTotal} at={row.lastAt} />
      <span className={`text-right font-montserrat text-[13px] font-bold tabular-nums ${deltaColor}`}>{fmtInt(delta)}</span>
      <span className={`text-right font-sans text-[12.5px] tabular-nums ${row.deltaMono === 0 ? 'text-ink-200' : 'text-ink-600'}`}>{fmtInt(row.deltaMono)}</span>
      <span className="font-mono text-[11.5px] text-ink-700">{row.source ?? '—'}</span>
      {row.hadCounterReset ? <EstadoChip label="RESET DE CONTADOR" variant="attention" /> : <span className="font-sans text-[12px] text-ink-200">—</span>}
    </div>
  );
}

function TotalsRow({ rows }: { rows: ReportRow[] }) {
  const totalDelta = rows.reduce((a, r) => a + displayDelta(r), 0);
  const totalMono = rows.reduce((a, r) => a + r.deltaMono, 0);
  const estimated = rows.filter((r) => r.hadCounterReset && r.deltaEstimated != null && r.deltaEstimated > 0).length;
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-t border-line-100 bg-surface-avatar px-5 py-3.5`}>
      <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.14em] text-ink-600">TOTAL DEL PERÍODO</span>
      <span /><span />
      <span className="text-right font-montserrat text-[15px] font-bold tabular-nums text-ink-900">{fmtInt(totalDelta)}</span>
      <span className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-600">{fmtInt(totalMono)}</span>
      <span className="font-sans text-[11.5px] text-ink-300">{fmtInt(rows.length)} equipos</span>
      <span className="font-sans text-[11.5px] text-brand-accent">{estimated > 0 ? `${fmtInt(estimated)} estimado(s)` : ''}</span>
    </div>
  );
}

function TableColumnHead() {
  return (
    <div className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-avatar px-5 py-3`}>
      {HEAD_LABELS.map((h, i) => (
        <span key={h} className={`font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300 ${i >= 1 && i <= 4 ? 'text-right' : ''}`}>{h}</span>
      ))}
    </div>
  );
}

function TableBody({ filtered, loading, error, filter, onRetry, onClearFilter }: {
  filtered: ReportRow[]; loading: boolean; error: string; filter: Filter; onRetry: () => void; onClearFilter: () => void;
}) {
  if (error) return <TableErrorState message={error} onRetry={onRetry} />;
  if (loading) return <>{Array.from({ length: 6 }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={['w-2/3', 'w-1/2', 'w-1/2', 'w-1/3', 'w-1/3', 'w-1/2', '']} />)}</>;
  if (filtered.length === 0) return <TableEmptyState message="Sin equipos con este filtro" hasActiveFilters={filter !== 'all'} onClearFilters={onClearFilter} />;
  return <>{filtered.map((r) => <Row key={r.key} row={r} />)}</>;
}

function filterRows(rows: ReportRow[], filter: Filter): ReportRow[] {
  if (filter === 'anomaly') return rows.filter((r) => r.hadCounterReset);
  if (filter === 'zero') return rows.filter((r) => displayDelta(r) === 0);
  return rows;
}

interface Props { period: string; rows: ReportRow[]; loading: boolean; error: string; onRetry: () => void }

/** Tabla densa "detalle por equipo" (handoff hifi #3, fase 5) + fila de
 * totales al pie — filtrado client-side sobre las filas ya cargadas
 * (preview/cierre no paginan). */
export default function ReportsDetailTable({ period, rows, loading, error, onRetry }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = filterRows(rows, filter);
  return (
    <div id="reports-detail-table" className="rounded-[5px] border border-line-100 bg-white">
      <TableHeader period={period} rows={rows} filter={filter} onFilter={setFilter} />
      <div className="overflow-x-auto">
        <div style={{ minWidth: TABLE_MIN_WIDTH }}>
          <TableColumnHead />
          <TableBody filtered={filtered} loading={loading} error={error} filter={filter} onRetry={onRetry} onClearFilter={() => setFilter('all')} />
        </div>
      </div>
      {!loading && !error && rows.length > 0 && <TotalsRow rows={rows} />}
    </div>
  );
}
