import { AlertTriangle } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import type { ActiveAlertItem } from '../../../types/deviceDetailPage';

export default function AlertsTab({ activeAlerts }: { activeAlerts: ActiveAlertItem[] }) {
  return (
    <Card>
      <CardTitle icon={<AlertTriangle size={16} />}>Alertas activas del dispositivo</CardTitle>
      {activeAlerts.length ? (
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200"><tr><th className="px-3 py-2.5">Severidad</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Descripción</th><th className="px-3 py-2.5 text-right">Hora</th></tr></thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {activeAlerts.map(a => (
              <tr key={a.key}>
                <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${a.severity === 'ERROR' || a.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : a.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.severity}</span></td>
                <td className="px-3 py-2 font-mono">{a.code ?? '—'}</td><td className="px-3 py-2 font-semibold text-slate-800">{a.message}</td><td className="px-3 py-2 text-right text-slate-500">{fmtDateTime(a.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-6 text-[11px] font-semibold text-slate-500 text-center">No hay alertas activas para este dispositivo.</p>
      )}
    </Card>
  );
}
