import { Download, FileSpreadsheet, FileText, Unlock } from 'lucide-react';
import EstadoChip from '../../../shared/components/EstadoChip';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';
import { fmtClosedAt, fmtInt } from '../lib/reportsPresentation';
import type { Closure } from '../types/reports';

/** 5 por página = una sola fila de celdas a ≥md: el historial es secundario
 * (la tabla de arriba es el contenido) y no puede robarle alto. */
const CLOSURES_PER_PAGE = 5;

interface Props {
  closures: Closure[];
  closuresLoading: boolean;
  activePeriod: string;
  isReadOnlyViewer: boolean;
  onSelectPeriod: (period: string) => void;
  onDownload: (closureId: string, format: 'csv' | 'xlsx' | 'pdf') => void;
  onReopenRequest: (closure: Closure) => void;
}

const ICON_BTN = 'rounded-[3px] p-1.5 text-ink-300 hover:bg-surface-btn-hover hover:text-brand-accent';

function DownloadButtons({ c, onDownload }: { c: Closure; onDownload: Props['onDownload'] }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onDownload(c.id, 'csv')} title="Descargar CSV" className={ICON_BTN}><Download size={13} /></button>
      <button type="button" onClick={() => onDownload(c.id, 'xlsx')} title="Descargar XLSX" className={ICON_BTN}><FileSpreadsheet size={13} /></button>
      <button type="button" onClick={() => onDownload(c.id, 'pdf')} title="Descargar PDF" className={ICON_BTN}><FileText size={13} /></button>
    </div>
  );
}

function ReopenButton({ c, isReadOnlyViewer, onReopenRequest }: { c: Closure; isReadOnlyViewer: boolean; onReopenRequest: Props['onReopenRequest'] }) {
  if (isReadOnlyViewer || c.status !== 'closed') return null;
  return <button type="button" onClick={() => onReopenRequest(c)} title="Reabrir" className={ICON_BTN}><Unlock size={13} /></button>;
}

type CellProps = Omit<Props, 'closures' | 'closuresLoading' | 'activePeriod'> & { c: Closure; active: boolean };

/** Celda compacta de dos líneas (período + estado + páginas / fecha + acciones):
 * cinco entran una al lado de la otra en los 1332px del contenido. */
function ClosureCell({ c, active, isReadOnlyViewer, onSelectPeriod, onDownload, onReopenRequest }: CellProps) {
  return (
    <div className={`min-w-0 px-4 py-2.5 ${active ? 'bg-brand-soft/40' : ''}`}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSelectPeriod(c.period.slice(0, 7))} className="font-mono text-[12px] font-semibold text-ink-900 hover:text-brand-accent hover:underline">
          {c.period.slice(0, 7)}
        </button>
        <EstadoChip label={c.status === 'closed' ? 'CERRADO' : 'REABIERTO'} variant={c.status === 'closed' ? 'neutral' : 'attention'} />
        <span className="ml-auto truncate font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmtInt(c.total_pages)} págs.</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 truncate font-sans text-[11px] text-ink-300">{fmtClosedAt(c.closed_at)}</span>
        <div className="ml-auto flex items-center gap-1">
          <DownloadButtons c={c} onDownload={onDownload} />
          <ReopenButton c={c} isReadOnlyViewer={isReadOnlyViewer} onReopenRequest={onReopenRequest} />
        </div>
      </div>
    </div>
  );
}

function ClosuresBody({ closures, closuresLoading, activePeriod, ...rest }: Props) {
  if (closuresLoading) return <div className="h-16 animate-pulse bg-surface-track" />;
  if (closures.length === 0) return <div className="py-5 text-center font-sans text-[12.5px] text-ink-300">Sin cierres todavía</div>;
  return (
    <div className="grid grid-cols-1 divide-y divide-line-200 md:grid-cols-5 md:divide-x md:divide-y-0">
      {closures.map((c) => <ClosureCell key={c.id} c={c} active={c.period.startsWith(activePeriod)} {...rest} />)}
    </div>
  );
}

/** Historial compacto (handoff hifi #3, fase 5) — sin expandir línea por
 * línea acá (eso ya lo muestra `ReportsDetailTable` para el período
 * seleccionado, sería la misma tabla dos veces): clickear un período lo
 * selecciona arriba en `ReportsPeriodBar`. Desde el 27/08/2026 es una tira
 * de altura fija paginada de a 5 — la lista crecía un mes por cliente para
 * siempre y empujaba la pantalla fuera del viewport. */
export default function ReportsClosuresHistory({ closures, ...rest }: Props) {
  // `cpage` y no `page`: la pantalla de Reportes ya usa `dpage` para la tabla de detalle.
  const paging = useClientPagination(closures, CLOSURES_PER_PAGE, 'cpage');
  return (
    <div className="mt-4 rounded-[5px] border border-line-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-line-150 pl-5">
        <span className="py-[14px] font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">HISTORIAL DE CIERRES</span>
        <HifiPagination page={paging.page} totalPages={paging.totalPages} total={paging.total} pageSize={paging.pageSize} itemLabel="cierres" onPageChange={paging.setPage} />
      </div>
      <ClosuresBody closures={paging.visible} {...rest} />
    </div>
  );
}
