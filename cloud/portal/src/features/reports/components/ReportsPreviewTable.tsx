import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { PreviewLine } from '../types/reports';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  period: string;
  totals: { total: number; mono: number; color: number };
  previewLines: PreviewLine[];
  previewLoading: boolean;
  previewError: string;
}

export default function ReportsPreviewTable({ period, totals, previewLines, previewLoading, previewError }: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-brand/5 overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Vista previa — {period}</h3>
        <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
          <span>Total: <span className="text-[#1a2333] font-black">{totals.total.toLocaleString()}</span></span>
          <span>Mono: {totals.mono.toLocaleString()}</span>
          <span>Color: {totals.color.toLocaleString()}</span>
        </div>
      </header>
      {previewError && <div className="p-4 text-xs font-medium text-rose-600 bg-rose-50">{previewError}</div>}
      {previewLoading ? (
        <div className="h-32 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-brand" /></div>
      ) : previewLines.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
          Sin equipos o sin lecturas en este período
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipo</th>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Lectura inicial</th>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Lectura final</th>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Delta</th>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fuente</th>
                <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {previewLines.map((l) => (
                <tr key={l.device_id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-4 text-[11px]">
                    <Link to={`/devices/${l.device_id}`} className="font-bold text-slate-700 hover:text-brand hover:underline">
                      {l.model || l.serial_number || 'Equipo'}
                    </Link>
                    <div className="text-[9px] text-slate-400 font-mono">{l.serial_number}</div>
                  </td>
                  <td className="py-2 px-4 text-[11px] text-slate-600">
                    {l.first_total ?? '—'} <span className="text-slate-400">({fmtDate(l.first_reading_at)})</span>
                  </td>
                  <td className="py-2 px-4 text-[11px] text-slate-600">
                    {l.last_total ?? '—'} <span className="text-slate-400">({fmtDate(l.last_reading_at)})</span>
                  </td>
                  <td className="py-2 px-4 text-[11px] font-black text-[#1a2333]">{Number(l.delta_total).toLocaleString()}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-500 uppercase">{l.source ?? '—'}</td>
                  <td className="py-2 px-4">
                    {l.had_counter_reset && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">
                        <AlertTriangle size={10} /> Reset de contador
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
