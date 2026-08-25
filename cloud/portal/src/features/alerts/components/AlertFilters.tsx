import type { AlertClassOption } from '../../../shared/types/alerts';
import type { AlertFiltersState, ClientOption, ResolvedFilter, AcknowledgedFilter } from '../hooks/useAlertsPage';
import { SELECT_CLASS } from '../lib/alertPresentation';

interface Props {
  filters: AlertFiltersState;
  classOptions: AlertClassOption[];
  clients: ClientOption[];
  canFilterByClient: boolean;
}

const AlertFilters = ({ filters: f, classOptions, clients, canFilterByClient }: Props) => (
  <div className="cd-panel bg-white border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center gap-3">
    <select value={f.severity} onChange={(e) => f.setSeverity(e.target.value)} className={SELECT_CLASS}>
      <option value="">Toda severidad</option>
      <option value="critical">Crítico</option>
      <option value="warning">Advertencia</option>
    </select>

    <select value={f.alertClass} onChange={(e) => f.setAlertClass(e.target.value)} className={SELECT_CLASS}>
      <option value="">Toda clase</option>
      {classOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>

    <select value={f.resolved} onChange={(e) => f.setResolved(e.target.value as ResolvedFilter)} className={SELECT_CLASS}>
      <option value="false">Sin resolver</option>
      <option value="true">Resueltas</option>
      <option value="">Todas</option>
    </select>

    <select value={f.acknowledged} onChange={(e) => f.setAcknowledged(e.target.value as AcknowledgedFilter)} className={SELECT_CLASS}>
      <option value="">Reconocida o no</option>
      <option value="false">Sin reconocer</option>
      <option value="true">Reconocidas</option>
    </select>

    {canFilterByClient && (
      <select value={f.clientId} onChange={(e) => f.setClientId(e.target.value)} className={SELECT_CLASS}>
        <option value="">Todos los clientes</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    )}
  </div>
);

export default AlertFilters;
