import { Link } from 'react-router-dom';
import { CheckSquare, Square } from 'lucide-react';
import type { Alert } from '../../../shared/types/alerts';
import type { AlertPatch } from '../hooks/useAlertsPage';
import { codeOf } from '../hooks/useAlertsPage';
import { SEVERITY_LABELS, classDot, fmtDate, severityDot } from '../lib/alertPresentation';
import { GRID_COLS } from './alertsGrid';
import EstadoChip from '../../../shared/components/EstadoChip';
import { TableEmptyState, TableErrorState, TableSkeletonRow } from '../../../shared/components/TableStates';

type Selection = { selected: Set<number>; allSelected: boolean; toggle: (id: number) => void; toggleAll: () => void };

interface Props {
  alerts: Alert[];
  classLabels: Record<string, string>;
  readOnly: boolean;
  selection: Selection;
  pendingId: number | null;
  groupByCode: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onUpdate: (id: number, patch: AlertPatch) => void;
  onCreateIncident: (alert: Alert) => void;
  skeletonRows?: number;
}

const HEAD_LABELS = ['SEVERIDAD', 'CLIENTE', 'MONITOR / EQUIPO', 'CÓDIGO Y MOTIVO', 'CLASE'];

function TargetCell({ a }: { a: Alert }) {
  if (a.device_id) return <Link to={`/devices/${a.device_id}`} className="truncate font-sans text-[12.5px] text-ink-900 hover:text-brand-accent hover:underline">{a.device_name || a.serial || 'Dispositivo'}</Link>;
  if (a.agent_id) return <Link to={`/monitors/${a.agent_id}`} className="truncate font-sans text-[12.5px] text-ink-900 hover:text-brand-accent hover:underline">{a.agent_name || 'Monitor'}</Link>;
  return <span className="truncate font-sans text-[12.5px] text-ink-200">Equipo sin identificar</span>;
}

function CodeAndReasonCell({ a }: { a: Alert }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[11.5px] text-ink-700">{a.type}</div>
      <div className="truncate font-sans text-[11px] text-ink-300">{a.alert_reason || a.message}</div>
    </div>
  );
}

function StatusChip({ a }: { a: Alert }) {
  if (a.resolved) return <EstadoChip label="RESUELTA" variant="neutral" />;
  if (a.acknowledged) return <EstadoChip label="RECONOCIDA" variant="neutral" />;
  return <EstadoChip label="SIN RECONOCER" variant="attention" />;
}

function RowCta({ a, pendingId, onUpdate, onCreateIncident }: Pick<Props, 'pendingId' | 'onUpdate' | 'onCreateIncident'> & { a: Alert }) {
  if (a.incident_id) {
    return <Link to={`/incidents/${a.incident_id}`} className="justify-self-end whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">VER INCIDENTE →</Link>;
  }
  if (!a.acknowledged) {
    return (
      <button type="button" disabled={pendingId === a.id} onClick={() => onUpdate(a.id, { acknowledged: true })} className="justify-self-end whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline disabled:opacity-50">
        RECONOCER →
      </button>
    );
  }
  return (
    <button type="button" onClick={() => onCreateIncident(a)} className="justify-self-end whitespace-nowrap font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">
      ABRIR INCIDENTE →
    </button>
  );
}

type RowProps = Pick<Props, 'classLabels' | 'readOnly' | 'selection' | 'pendingId' | 'onUpdate' | 'onCreateIncident'> & { a: Alert };

function AlertRow({ a, classLabels, readOnly, selection, pendingId, onUpdate, onCreateIncident }: RowProps) {
  return (
    <div data-fit-row className={`grid ${GRID_COLS} min-h-[54px] items-center gap-x-[14px] border-b border-line-200 px-5 py-[11px] transition-colors duration-150 ease-in-out hover:bg-surface-hover`}>
      {readOnly ? <span /> : (
        <button type="button" onClick={() => selection.toggle(a.id)} className="justify-self-start text-ink-300 hover:text-ink-100" title="Seleccionar">
          {selection.selected.has(a.id) ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} />}
        </button>
      )}
      <span className="justify-self-start"><EstadoChip label={SEVERITY_LABELS[a.severity] ?? a.severity} variant="attention" dotClassName={severityDot(a.severity)} /></span>
      <span className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{a.client_name || '—'}</span>
      <TargetCell a={a} />
      <CodeAndReasonCell a={a} />
      <span className="justify-self-start"><EstadoChip label={a.alert_class ? (classLabels[a.alert_class] ?? a.alert_class) : 'Otro'} variant="neutral" dotClassName={classDot(a.alert_class)} /></span>
      <span className="text-right font-sans text-[12px] text-ink-600">{fmtDate(a.created_at)}</span>
      <span className="justify-self-start"><StatusChip a={a} /></span>
      {readOnly ? <span /> : <RowCta a={a} pendingId={pendingId} onUpdate={onUpdate} onCreateIncident={onCreateIncident} />}
    </div>
  );
}

function HeaderRow({ readOnly, selection }: Pick<Props, 'readOnly' | 'selection'>) {
  return (
    <div data-fit-fixed className={`grid ${GRID_COLS} items-center gap-x-[14px] border-b border-line-100 bg-surface-table-head px-5 py-3`}>
      {readOnly ? <span /> : (
        <button type="button" onClick={selection.toggleAll} className="justify-self-start text-ink-300 hover:text-ink-100" title="Seleccionar todos">
          {selection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
      )}
      {HEAD_LABELS.map((l) => <div key={l} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{l}</div>)}
      <div className="text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">DETECTADA</div>
      <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">ESTADO</div>
      <div />
    </div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="border-b border-line-200 bg-surface-table-head px-5 py-2 font-montserrat text-[9px] font-bold uppercase tracking-[.1em] text-ink-600">
      {label} · {count}
    </div>
  );
}

function GroupedRows(props: Omit<Props, 'groupByCode' | 'loading' | 'error' | 'onRetry' | 'skeletonRows'>) {
  const groups = new Map<string, Alert[]>();
  for (const a of props.alerts) {
    const code = codeOf(a);
    groups.set(code, [...(groups.get(code) ?? []), a]);
  }
  const sorted = Array.from(groups.entries()).sort((x, y) => y[1].length - x[1].length);
  return (
    <>
      {sorted.map(([code, rows]) => (
        <div key={code}>
          <GroupHeader label={props.classLabels[code] ?? code} count={rows.length} />
          {rows.map((a) => <AlertRow key={a.id} a={a} {...props} />)}
        </div>
      ))}
    </>
  );
}

const SKELETON_WIDTHS = ['', 'w-3/5', 'w-2/5', 'w-1/2', 'w-3/5', 'w-2/5', 'w-2/5', 'w-2/5', ''];

function Body(props: Props) {
  if (props.error) return <TableErrorState message="No se pudo cargar" onRetry={props.onRetry} />;
  if (props.loading) return <>{Array.from({ length: props.skeletonRows ?? 8 }, (_, i) => <TableSkeletonRow key={i} gridCols={GRID_COLS} widths={SKELETON_WIDTHS} />)}</>;
  if (props.alerts.length === 0) return <TableEmptyState message="Ningún resultado con los filtros actuales" />;
  return props.groupByCode ? <GroupedRows {...props} /> : <>{props.alerts.map((a) => <AlertRow key={a.id} a={a} {...props} />)}</>;
}

/** Tabla de Alertas (handoff hifi #3, 26/08/2026): checkbox + severidad + cliente +
 * equipo + código y motivo (fusionados) + clase + detectada + estado + CTA única
 * por fila. `ACCIÓN` (responder) se elimina — "Con formación" repetido no informaba
 * nada; `groupByCode` reagrupa la página visible sin pedir datos nuevos. */
export default function AlertsTable(props: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1320px]" role="table" aria-label="Alertas">
        <HeaderRow readOnly={props.readOnly} selection={props.selection} />
        <Body {...props} />
      </div>
    </div>
  );
}
