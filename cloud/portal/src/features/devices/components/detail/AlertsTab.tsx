import { AlertTriangle } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import { alertTierOf, ALERT_TIER_STYLE } from '../../lib/deviceAlertTier';
import type { ActiveAlertItem } from '../../types/deviceDetailPage';

export default function AlertsTab({ activeAlerts }: { activeAlerts: ActiveAlertItem[] }) {
  return (
    <Card>
      <CardTitle icon={<AlertTriangle size={16} />}>Alertas activas del dispositivo</CardTitle>
      {activeAlerts.length ? (
        <table className="w-full text-left">
          <thead className="border-b border-line-100 bg-surface-table-head">
            <tr>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Severidad</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Código</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Descripción</th>
              <th className="px-3 py-2.5 text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-200">
            {activeAlerts.map(a => {
              const tier = alertTierOf(a.severity, a.alertClass);
              const style = ALERT_TIER_STYLE[tier];
              return (
                <tr key={a.key}>
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
            })}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-6 text-center font-sans text-[12.5px] text-ink-300">No hay alertas activas para este dispositivo.</p>
      )}
    </Card>
  );
}
