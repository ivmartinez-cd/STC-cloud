import { History, Loader2 } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import type { AuditLogItem } from '../../../../shared/types/audit';

export default function HistoryTab({ history, historyLoading }: { history: AuditLogItem[] | null; historyLoading: boolean }) {
  return (
    <Card>
      <CardTitle icon={<History size={16} />}>Historial de movimientos y cambios</CardTitle>
      {historyLoading ? (
        <div className="py-10 flex flex-col items-center justify-center">
          <Loader2 size={24} className="text-brand animate-spin mb-2" />
          <p className="font-montserrat text-[9px] font-bold uppercase tracking-[.14em] text-ink-300">Cargando historial...</p>
        </div>
      ) : history && history.length ? (
        <table className="w-full text-left">
          <thead className="border-b border-line-100 bg-surface-table-head">
            <tr>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Fecha</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Acción</th>
              <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Usuario</th>
              <th className="px-3 py-2.5 text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-200">
            {history.map((h) => (
              <tr key={h.id}>
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
    </Card>
  );
}
