import { Inbox } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { InputTrayInfo, OutputTrayInfo } from '../../../../shared/types/monitor';

export default function MediaTab({ inputTrays, outputTrays }: { inputTrays: InputTrayInfo[] | undefined; outputTrays: OutputTrayInfo[] | undefined }) {
  return (
    <Card>
      <CardTitle icon={<Inbox size={16} />}>Bandejas de medios</CardTitle>
      {(inputTrays?.length || outputTrays?.length) ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Bandeja</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Tamaño de papel</th><th className="px-3 py-2.5">Tipo de papel</th>
                <th className="px-3 py-2.5 text-right">Capacidad</th><th className="px-3 py-2.5 min-w-[120px]">Nivel</th><th className="px-3 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
              {(inputTrays ?? []).map(t => (
                <tr key={`in-${t.name}`} className="hover:bg-slate-50/90">
                  <td className="px-3 py-2 font-bold text-slate-800">{t.name}</td><td className="px-3 py-2">Entrada</td>
                  <td className="px-3 py-2">{t.paperSize ?? '—'}</td><td className="px-3 py-2">{t.paperType ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{t.capacity != null ? `${fmtInt(t.capacity)} hojas` : '—'}</td>
                  <td className="px-3 py-2">{t.level != null ? (
                    <div className="flex items-center gap-1.5"><div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${t.level <= 10 ? 'bg-rose-500' : 'bg-brand/100'}`} style={{ width: `${Math.max(0, Math.min(100, t.level))}%` }} /></div><span className="font-extrabold w-8 text-right">{t.level}%</span></div>
                  ) : '—'}</td>
                  <td className="px-3 py-2">{t.status ?? '—'}</td>
                </tr>
              ))}
              {(outputTrays ?? []).map(t => (
                <tr key={`out-${t.name}`} className="hover:bg-slate-50/90">
                  <td className="px-3 py-2 font-bold text-slate-800">{t.name}</td><td className="px-3 py-2">Salida</td>
                  <td className="px-3 py-2">—</td><td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 text-right">{t.capacity != null ? String(t.capacity) : '—'}</td>
                  <td className="px-3 py-2">{t.level != null ? `${t.level}%` : '—'}</td>
                  <td className="px-3 py-2">{t.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-[11px] font-semibold text-slate-500 text-center">El equipo no reportó información de bandejas.</p>
      )}
    </Card>
  );
}
