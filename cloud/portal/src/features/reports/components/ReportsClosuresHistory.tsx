import { Download, FileSpreadsheet, FileText, Unlock, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react';
import type { Closure, ClosureDetail } from '../types/reports';
import { APP_LOCALE } from '../../../shared/lib/formatters';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  closures: Closure[];
  closuresLoading: boolean;
  expandedId: string | null;
  detail: ClosureDetail | null;
  detailLoading: boolean;
  isReadOnlyViewer: boolean;
  onToggleExpand: (closure: Closure) => void;
  onDownload: (closureId: string, format: 'csv' | 'xlsx' | 'pdf') => void;
  onReopenRequest: (closure: Closure) => void;
}

export default function ReportsClosuresHistory({
  closures, closuresLoading, expandedId, detail, detailLoading, isReadOnlyViewer, onToggleExpand, onDownload, onReopenRequest,
}: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-brand/5 overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Historial de cierres</h3>
      </header>
      {closuresLoading ? (
        <div className="h-24 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-brand" /></div>
      ) : closures.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
          Sin cierres todavía
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {closures.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50/50">
                <button onClick={() => onToggleExpand(c)} className="text-slate-400 hover:text-brand">
                  {expandedId === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <span className="text-xs font-black text-[#1a2333] w-20">{c.period.slice(0, 7)}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  c.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {c.status === 'closed' ? <CheckCircle2 size={10} /> : <Unlock size={10} />}
                  {c.status === 'closed' ? 'Cerrado' : 'Reabierto'}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">{fmtDate(c.closed_at)}</span>
                <span className="text-[11px] font-black text-slate-700 ml-auto">{Number(c.total_pages).toLocaleString()} págs.</span>
                <button onClick={() => onDownload(c.id, 'csv')} title="Descargar CSV"
                  className="p-2 bg-slate-50 text-slate-500 hover:text-brand hover:bg-brand/10 rounded-xl transition-all">
                  <Download size={14} />
                </button>
                <button onClick={() => onDownload(c.id, 'xlsx')} title="Descargar XLSX"
                  className="p-2 bg-slate-50 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                  <FileSpreadsheet size={14} />
                </button>
                <button onClick={() => onDownload(c.id, 'pdf')} title="Descargar PDF"
                  className="p-2 bg-slate-50 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                  <FileText size={14} />
                </button>
                {!isReadOnlyViewer && c.status === 'closed' && (
                  <button onClick={() => onReopenRequest(c)} title="Reabrir"
                    className="p-2 bg-slate-50 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all">
                    <Unlock size={14} />
                  </button>
                )}
              </div>
              {expandedId === c.id && (
                <div className="px-6 pb-4 bg-slate-50/50">
                  {detailLoading ? (
                    <div className="py-6 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-brand" /></div>
                  ) : detail && detail.id === c.id ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white mt-2">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Serie</th>
                            <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                            <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Monitor</th>
                            <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Delta</th>
                            <th className="py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Fuente</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detail.lines.map((l) => (
                            <tr key={l.id}>
                              <td className="py-1.5 px-3 text-[10px] font-mono text-slate-600">{l.device_serial ?? '—'}</td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-700 font-bold">{l.device_model ?? '—'}</td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-500">{l.agent_name ?? '—'}</td>
                              <td className="py-1.5 px-3 text-[10px] font-black text-[#1a2333]">{Number(l.delta_total).toLocaleString()}</td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-400 uppercase">{l.source ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
