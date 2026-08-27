import { AlertTriangle } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import { alertTierOf, ALERT_TIER_STYLE } from '../../lib/deviceAlertTier';
import HifiPagination from '../../../../shared/components/HifiPagination';
import { useFitRows } from '../../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../../shared/hooks/useClientPagination';
import type { ActiveAlertItem } from '../../types/deviceDetailPage';

const TH = 'px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300';

/** Tab "Alertas" — las filas se paginan según el alto disponible (rediseño
 * sin scroll, 27/08/2026); antes la lista era ilimitada. */
export default function AlertsTab({ activeAlerts }: { activeAlerts: ActiveAlertItem[] }) {
  const fit = useFitRows({ estimate: 40 });
  const pager = useClientPagination(activeAlerts, fit.rows);
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardTitle icon={<AlertTriangle size={16} />}>Alertas activas del dispositivo</CardTitle>
      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        {activeAlerts.length ? (
          <table className="w-full text-left">
            <thead data-fit-fixed className="border-b border-line-100 bg-surface-table-head">
              <tr>
                <th className={TH}>Severidad</th>
                <th className={TH}>Código</th>
                <th className={TH}>Descripción</th>
                <th className={`${TH} text-right`}>Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {pager.visible.map((a) => <AlertRow key={a.key} a={a} />)}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-center font-sans text-[12.5px] text-ink-300">No hay alertas activas para este dispositivo.</p>
        )}
      </div>
      {activeAlerts.length > pager.pageSize && (
        <HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="alertas" onPageChange={pager.setPage} />
      )}
    </Card>
  );
}

function AlertRow({ a }: { a: ActiveAlertItem }) {
  const tier = alertTierOf(a.severity, a.alertClass);
  const style = ALERT_TIER_STYLE[tier];
  return (
    <tr data-fit-row>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-[6px] rounded-[2px] ${style.bg} px-2 py-[3px] font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] ${style.fg}`}>
          <span className={`block h-1.5 w-1.5 rounded-full ${style.dot}`} />{tier}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">{a.code ?? '—'}</td>
      <td className="px-3 py-2 font-sans text-[12.5px] font-semibold text-ink-900">{a.message}</td>
      <td className="px-3 py-2 text-right font-mono text-[11.5px] text-ink-700">{fmtDateTime(a.time)}</td>
    </tr>
  );
}
