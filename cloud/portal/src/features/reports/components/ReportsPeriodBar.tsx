import EstadoChip from '../../../shared/components/EstadoChip';
import { fmtClosedAt } from '../lib/reportsPresentation';
import type { ReportsPageState } from '../hooks/useReportsPage';

function ClientSelect({ s }: { s: ReportsPageState }) {
  if (s.isReadOnlyViewer) return null;
  return (
    <select
      value={s.selectedClientId} onChange={(e) => s.setSelectedClientId(e.target.value)}
      className="min-w-[260px] max-w-[380px] rounded-[3px] border border-line-100 bg-white px-3 py-[9px] font-sans text-[12.5px] font-semibold text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-brand"
    >
      <option value="">Seleccionar cliente…</option>
      {s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function PeriodStatusChip({ s }: { s: ReportsPageState }) {
  if (s.closure?.status === 'closed') return <EstadoChip label={`PERÍODO CERRADO · ${fmtClosedAt(s.closure.closed_at).split(' ')[0]}`} variant="neutral" />;
  return <EstadoChip label="PERÍODO ABIERTO" variant="attention" />;
}

/** Selector cliente/período + estado del período (handoff hifi #3, fase 5) —
 * unifica lo que antes eran dos vistas separadas (preview siempre visible +
 * lista de cierres aparte): cambiar el período acá decide sola si se ve la
 * vista previa en vivo o el cierre persistido. */
export default function ReportsPeriodBar({ s }: { s: ReportsPageState }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[5px] border border-line-100 bg-white p-4">
      <ClientSelect s={s} />
      <input
        type="month" value={s.period} onChange={(e) => s.setPeriod(e.target.value)}
        className="rounded-[3px] border border-line-100 bg-white px-3 py-[9px] font-sans text-[12.5px] font-semibold text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-brand"
      />
      <PeriodStatusChip s={s} />
      <div className="flex-1" />
      {s.closure?.status === 'closed' && (
        <span className="font-sans text-[11.5px] text-ink-300">Cierre generado el {fmtClosedAt(s.closure.closed_at)}</span>
      )}
    </div>
  );
}
