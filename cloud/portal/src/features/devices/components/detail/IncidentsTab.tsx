import { AlertOctagon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import EstadoChip from '../../../../shared/components/EstadoChip';
import { INCIDENT_STATUS_LABELS } from '../../../../shared/lib/constants';
import type { Incident } from '../../../../shared/types/incidents';

const OPEN_STATUSES = new Set(['open', 'in_progress']);

export default function IncidentsTab({ incidents, incidentsLoading }: { incidents: Incident[] | null; incidentsLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardTitle icon={<AlertOctagon size={16} />}>Incidentes de este equipo</CardTitle>
      {incidentsLoading ? (
        <div className="py-10 flex flex-col items-center justify-center">
          <Loader2 size={24} className="text-brand animate-spin mb-2" />
          <p className="font-montserrat text-[9px] font-bold uppercase tracking-[.14em] text-ink-300">Cargando incidentes...</p>
        </div>
      ) : incidents && incidents.length ? (
        <table className="w-full text-left">
          <thead className="border-b border-line-100 bg-surface-table-head">
            <tr>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">#</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Título</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Clase</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Estado</th>
              <th className="px-3 py-2.5 text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Apertura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-200">
            {incidents.map((inc) => (
              <tr key={inc.id} className="cursor-pointer hover:bg-surface-avatar" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">#{inc.number}</td>
                <td className="px-3 py-2 font-sans text-[12.5px] font-semibold text-ink-900">{inc.title}</td>
                <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{inc.class}</td>
                <td className="px-3 py-2">
                  <EstadoChip variant={OPEN_STATUSES.has(inc.status) ? 'attention' : 'neutral'} label={INCIDENT_STATUS_LABELS[inc.status]} />
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11.5px] text-ink-700">{fmtDateTime(inc.opened_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-6 text-center font-sans text-[12.5px] text-ink-300">Sin incidentes para este equipo.</p>
      )}
    </Card>
  );
}
