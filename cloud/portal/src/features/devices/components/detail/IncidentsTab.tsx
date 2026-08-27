import { AlertOctagon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import EstadoChip from '../../../../shared/components/EstadoChip';
import HifiPagination from '../../../../shared/components/HifiPagination';
import { useFitRows } from '../../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../../shared/hooks/useClientPagination';
import { INCIDENT_STATUS_LABELS } from '../../../../shared/lib/constants';
import type { Incident } from '../../../../shared/types/incidents';

const OPEN_STATUSES = new Set(['open', 'in_progress']);
const TH = 'px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300';
const EMPTY: Incident[] = [];

/** Tab "Incidentes" — filas paginadas según el alto disponible (rediseño sin
 * scroll, 27/08/2026); el fetch ya viene con `limit=50` desde la página. */
export default function IncidentsTab({ incidents, incidentsLoading }: { incidents: Incident[] | null; incidentsLoading: boolean }) {
  const navigate = useNavigate();
  const fit = useFitRows({ estimate: 40 });
  const pager = useClientPagination(incidents ?? EMPTY, fit.rows);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardTitle icon={<AlertOctagon size={16} />}>Incidentes de este equipo</CardTitle>
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        {incidentsLoading ? (
          <div className="py-10 flex flex-col items-center justify-center">
            <Loader2 size={24} className="text-brand animate-spin mb-2" />
            <p className="font-montserrat text-[9px] font-bold uppercase tracking-[.14em] text-ink-300">Cargando incidentes...</p>
          </div>
        ) : incidents && incidents.length ? (
          <table className="w-full text-left">
            <thead data-fit-fixed className="border-b border-line-100 bg-surface-table-head">
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Título</th>
                <th className={TH}>Clase</th>
                <th className={TH}>Estado</th>
                <th className={`${TH} text-right`}>Apertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {pager.visible.map((inc) => (
                <tr key={inc.id} data-fit-row className="cursor-pointer hover:bg-surface-avatar" onClick={() => navigate(`/incidents/${inc.id}`)}>
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
      </div>
      {pager.total > pager.pageSize && (
        <HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="incidentes" onPageChange={pager.setPage} />
      )}
    </Card>
  );
}
