import { Download, FileSpreadsheet, FileText, Unlock } from 'lucide-react';
import EstadoChip from '../../../shared/components/EstadoChip';
import { fmtClosedAt, fmtInt } from '../lib/reportsPresentation';
import type { Closure } from '../types/reports';

interface Props {
  closures: Closure[];
  closuresLoading: boolean;
  activePeriod: string;
  isReadOnlyViewer: boolean;
  onSelectPeriod: (period: string) => void;
  onDownload: (closureId: string, format: 'csv' | 'xlsx' | 'pdf') => void;
  onReopenRequest: (closure: Closure) => void;
}

function DownloadButtons({ c, onDownload }: { c: Closure; onDownload: Props['onDownload'] }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onDownload(c.id, 'csv')} title="Descargar CSV" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><Download size={13} /></button>
      <button type="button" onClick={() => onDownload(c.id, 'xlsx')} title="Descargar XLSX" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><FileSpreadsheet size={13} /></button>
      <button type="button" onClick={() => onDownload(c.id, 'pdf')} title="Descargar PDF" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><FileText size={13} /></button>
    </div>
  );
}

function ClosureRow({ c, active, isReadOnlyViewer, onSelectPeriod, onDownload, onReopenRequest }: {
  c: Closure; active: boolean; isReadOnlyViewer: boolean;
  onSelectPeriod: Props['onSelectPeriod']; onDownload: Props['onDownload']; onReopenRequest: Props['onReopenRequest'];
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 px-5 py-3 ${active ? 'bg-brand-soft/40' : ''}`}>
      <button type="button" onClick={() => onSelectPeriod(c.period.slice(0, 7))} className="font-mono text-[12px] font-semibold text-ink-900 hover:text-brand-accent hover:underline">
        {c.period.slice(0, 7)}
      </button>
      <EstadoChip label={c.status === 'closed' ? 'CERRADO' : 'REABIERTO'} variant={c.status === 'closed' ? 'neutral' : 'attention'} />
      <span className="font-sans text-[11px] text-ink-300">{fmtClosedAt(c.closed_at)}</span>
      <span className="ml-auto font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmtInt(c.total_pages)} págs.</span>
      <DownloadButtons c={c} onDownload={onDownload} />
      {!isReadOnlyViewer && c.status === 'closed' && (
        <button type="button" onClick={() => onReopenRequest(c)} title="Reabrir" className="rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent"><Unlock size={13} /></button>
      )}
    </div>
  );
}

/** Historial compacto (handoff hifi #3, fase 5) — sin expandir línea por
 * línea acá (eso ya lo muestra `ReportsDetailTable` para el período
 * seleccionado, sería la misma tabla dos veces): clickear un período lo
 * selecciona arriba en `ReportsPeriodBar`. */
export default function ReportsClosuresHistory({ closures, closuresLoading, activePeriod, isReadOnlyViewer, onSelectPeriod, onDownload, onReopenRequest }: Props) {
  return (
    <div className="mt-4 rounded-[5px] border border-line-100 bg-white">
      <div className="border-b border-line-150 px-5 py-[14px]">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">HISTORIAL DE CIERRES</span>
      </div>
      {closuresLoading ? (
        <div className="h-16 animate-pulse bg-surface-track" />
      ) : closures.length === 0 ? (
        <div className="py-8 text-center font-sans text-[12.5px] text-ink-300">Sin cierres todavía</div>
      ) : (
        <div className="divide-y divide-line-200">
          {closures.map((c) => (
            <ClosureRow key={c.id} c={c} active={c.period.startsWith(activePeriod)} isReadOnlyViewer={isReadOnlyViewer}
              onSelectPeriod={onSelectPeriod} onDownload={onDownload} onReopenRequest={onReopenRequest} />
          ))}
        </div>
      )}
    </div>
  );
}
