import { History, Loader2 } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import HifiPagination from '../../../../shared/components/HifiPagination';
import { useFitRows } from '../../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../../shared/hooks/useClientPagination';
import type { AuditLogItem } from '../../../../shared/types/audit';

const TH = 'px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300';
const EMPTY: AuditLogItem[] = [];

/** Tab "Historial" — filas paginadas según el alto disponible (rediseño sin
 * scroll, 27/08/2026); el fetch ya viene con `limit=50` desde la página. */
export default function HistoryTab({ history, historyLoading }: { history: AuditLogItem[] | null; historyLoading: boolean }) {
  const fit = useFitRows({ estimate: 40 });
  const pager = useClientPagination(history ?? EMPTY, fit.rows);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardTitle icon={<History size={16} />}>Historial de movimientos y cambios</CardTitle>
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        {historyLoading ? (
          <div className="py-10 flex flex-col items-center justify-center">
            <Loader2 size={24} className="text-brand animate-spin mb-2" />
            <p className="font-montserrat text-[9px] font-bold uppercase tracking-[.14em] text-ink-300">Cargando historial...</p>
          </div>
        ) : history && history.length ? (
          <table className="w-full text-left">
            <thead data-fit-fixed className="border-b border-line-100 bg-surface-table-head">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Acción</th>
                <th className={TH}>Usuario</th>
                <th className={`${TH} text-right`}>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {pager.visible.map((h) => (
                <tr key={h.id} data-fit-row>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">{fmtDateTime(h.created_at)}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] font-semibold text-ink-900">{h.action_label}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{h.user_username ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[11.5px] text-ink-700">{h.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-center font-sans text-[12.5px] text-ink-300">Sin movimientos registrados para este equipo.</p>
        )}
      </div>
      {pager.total > pager.pageSize && (
        <HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="movimientos" onPageChange={pager.setPage} />
      )}
    </Card>
  );
}
