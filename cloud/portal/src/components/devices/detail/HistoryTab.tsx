import { History, Loader2 } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import type { AuditLogItem } from '../../../types/audit';

export default function HistoryTab({ history, historyLoading }: { history: AuditLogItem[] | null; historyLoading: boolean }) {
  return (
    <Card>
      <CardTitle icon={<History size={16} />}>Historial de movimientos y cambios</CardTitle>
      {historyLoading ? (
        <div className="py-10 flex flex-col items-center justify-center">
          <Loader2 size={24} className="text-brand animate-spin mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando historial...</p>
        </div>
      ) : history && history.length ? (
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200"><tr><th className="px-3 py-2.5">Fecha</th><th className="px-3 py-2.5">Acción</th><th className="px-3 py-2.5">Usuario</th><th className="px-3 py-2.5 text-right">IP</th></tr></thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {history.map((h) => (
              <tr key={h.id}>
                <td className="px-3 py-2 text-slate-500">{fmtDateTime(h.created_at)}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{h.action_label}</td>
                <td className="px-3 py-2">{h.user_username ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{h.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-6 text-[11px] font-semibold text-slate-500 text-center">Sin movimientos registrados para este equipo.</p>
      )}
    </Card>
  );
}
