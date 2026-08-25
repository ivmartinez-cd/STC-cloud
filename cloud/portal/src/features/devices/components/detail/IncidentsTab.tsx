import { AlertOctagon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS } from '../../../../shared/lib/constants';
import type { Incident } from '../../../../shared/types/incidents';

export default function IncidentsTab({ incidents, incidentsLoading }: { incidents: Incident[] | null; incidentsLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardTitle icon={<AlertOctagon size={16} />}>Incidentes de este equipo</CardTitle>
      {incidentsLoading ? (
        <div className="py-10 flex flex-col items-center justify-center">
          <Loader2 size={24} className="text-brand animate-spin mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando incidentes...</p>
        </div>
      ) : incidents && incidents.length ? (
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200">
            <tr><th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">Título</th><th className="px-3 py-2.5">Clase</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5 text-right">Apertura</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {incidents.map((inc) => (
              <tr key={inc.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/incidents/${inc.id}`)}>
                <td className="px-3 py-2 font-mono text-slate-500">#{inc.number}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{inc.title}</td>
                <td className="px-3 py-2">{inc.class}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${INCIDENT_STATUS_COLORS[inc.status]}`}>
                    {INCIDENT_STATUS_LABELS[inc.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-500">{fmtDateTime(inc.opened_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-6 text-[11px] font-semibold text-slate-500 text-center">Sin incidentes para este equipo.</p>
      )}
    </Card>
  );
}
