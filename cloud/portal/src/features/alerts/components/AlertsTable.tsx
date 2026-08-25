import { Link } from 'react-router-dom';
import { Check, CheckCircle2, CheckSquare, Square, AlertOctagon } from 'lucide-react';
import type { Alert, AlertClassOption, ResponderOption } from '../../../shared/types/alerts';
import type { AlertPatch } from '../hooks/useAlertsPage';
import { CLASS_COLOR, SEVERITY_COLOR, SEVERITY_LABELS, TH_CLASS, fmtDate } from '../lib/alertPresentation';

type Selection = { selected: Set<number>; allSelected: boolean; toggle: (id: number) => void; toggleAll: () => void };

interface Props {
  alerts: Alert[];
  classOptions: AlertClassOption[];
  responderOptions: ResponderOption[];
  readOnly: boolean;
  selection: Selection;
  pendingId: number | null;
  onUpdate: (id: number, patch: AlertPatch) => void;
  onCreateIncident: (alert: Alert) => void;
}

const COLUMNS = ['Severidad', 'Cliente', 'Monitor / Equipo', 'Código', 'Motivo', 'Clase', 'Acción', 'Fecha', 'Estado'];

const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${className}`}>{children}</span>
);

const TargetLink = ({ a }: { a: Alert }) => {
  if (a.device_id) {
    return <Link to={`/devices/${a.device_id}`} className="hover:text-brand hover:underline">{a.device_name || a.serial || 'Dispositivo'}</Link>;
  }
  if (a.agent_id) {
    return <Link to={`/monitors/${a.agent_id}`} className="hover:text-brand hover:underline">{a.agent_name || 'Monitor'}</Link>;
  }
  return <>—</>;
};

const StatusCell = ({ a }: { a: Alert }) => (
  <div className="flex flex-col gap-1">
    <span className={`text-[9px] font-bold uppercase tracking-wider ${a.resolved ? 'text-emerald-600' : 'text-slate-400'}`}>
      {a.resolved ? 'Resuelta' : 'Activa'}
    </span>
    {a.acknowledged && <span className="text-[9px] font-bold uppercase tracking-wider text-brand-gray">Reconocida</span>}
  </div>
);

type ActionsProps = Pick<Props, 'pendingId' | 'onUpdate' | 'onCreateIncident'> & { a: Alert };

const IncidentAction = ({ a, onCreateIncident }: Pick<ActionsProps, 'a' | 'onCreateIncident'>) =>
  a.incident_id ? (
    <Link to={`/incidents/${a.incident_id}`} onClick={(ev) => ev.stopPropagation()} title={`Incidente #${a.incident_number}`}
      className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all">
      <AlertOctagon size={14} />
    </Link>
  ) : (
    <button onClick={() => onCreateIncident(a)} title="Crear incidente"
      className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all">
      <AlertOctagon size={14} />
    </button>
  );

const RowActions = ({ a, pendingId, onUpdate, onCreateIncident }: ActionsProps) => (
  <div className="flex items-center justify-end gap-2">
    {!a.acknowledged && (
      <button disabled={pendingId === a.id} onClick={() => onUpdate(a.id, { acknowledged: true })} title="Reconocer"
        className="p-2 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all disabled:opacity-50">
        <Check size={14} />
      </button>
    )}
    {!a.resolved && (
      <button disabled={pendingId === a.id} onClick={() => onUpdate(a.id, { resolved: true })} title="Resolver"
        className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all disabled:opacity-50">
        <CheckCircle2 size={14} />
      </button>
    )}
    <IncidentAction a={a} onCreateIncident={onCreateIncident} />
  </div>
);

type RowProps = Omit<Props, 'alerts'> & { a: Alert };

const AlertRow = ({ a, classOptions, responderOptions, readOnly, selection, pendingId, onUpdate, onCreateIncident }: RowProps) => (
  <tr className="hover:bg-slate-50/50 transition-colors">
    {!readOnly && (
      <td className="py-2.5 px-4">
        <button onClick={() => selection.toggle(a.id)} className="text-slate-300 hover:text-brand">
          {selection.selected.has(a.id) ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} />}
        </button>
      </td>
    )}
    <td className="py-2.5 px-4"><Badge className={SEVERITY_COLOR(a.severity)}>{SEVERITY_LABELS[a.severity] ?? a.severity}</Badge></td>
    <td className="py-2.5 px-4 text-[11px] text-slate-700 font-bold">{a.client_name || '—'}</td>
    <td className="py-2.5 px-4 text-[11px] text-slate-600"><TargetLink a={a} /></td>
    <td className="py-2.5 px-4 text-[10px] font-mono text-slate-500" title={a.type}>{a.type}</td>
    <td className="py-2.5 px-4 text-[11px] text-slate-600 max-w-[280px] truncate" title={a.message}>{a.alert_reason || a.message}</td>
    <td className="py-2.5 px-4">
      {a.alert_class
        ? <Badge className={CLASS_COLOR[a.alert_class]}>{classOptions.find((c) => c.id === a.alert_class)?.label ?? a.alert_class}</Badge>
        : '—'}
    </td>
    <td className="py-2.5 px-4 text-[10px] font-bold text-slate-500">
      {a.responder ? (responderOptions.find((r) => r.id === a.responder)?.label ?? a.responder) : '—'}
    </td>
    <td className="py-2.5 px-4 text-[10px] text-slate-500 font-medium">{fmtDate(a.created_at)}</td>
    <td className="py-2.5 px-4"><StatusCell a={a} /></td>
    {!readOnly && (
      <td className="py-2.5 px-4 text-right">
        <RowActions a={a} pendingId={pendingId} onUpdate={onUpdate} onCreateIncident={onCreateIncident} />
      </td>
    )}
  </tr>
);

const TableHead = ({ readOnly, selection }: Pick<Props, 'readOnly' | 'selection'>) => (
  <thead className="bg-slate-50 border-b border-slate-100">
    <tr>
      {!readOnly && (
        <th className="py-3 px-4 w-8">
          <button onClick={selection.toggleAll} className="text-slate-400 hover:text-brand" title="Seleccionar todos">
            {selection.allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        </th>
      )}
      {COLUMNS.map((c) => <th key={c} className={TH_CLASS}>{c}</th>)}
      {!readOnly && <th className={`${TH_CLASS} text-right`}>Acciones</th>}
    </tr>
  </thead>
);

const AlertsTable = (props: Props) => (
  <div className="w-full overflow-x-auto rounded-3xl border border-slate-100 bg-white">
    <table className="w-full text-left border-collapse whitespace-nowrap">
      <TableHead readOnly={props.readOnly} selection={props.selection} />
      <tbody className="divide-y divide-slate-50">
        {props.alerts.map((a) => <AlertRow key={a.id} a={a} {...props} />)}
      </tbody>
    </table>
  </div>
);

export default AlertsTable;
