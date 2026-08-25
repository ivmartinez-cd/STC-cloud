import { Inbox } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import SupplyLevelBar from '../../../../shared/components/SupplyLevelBar';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { InputTrayInfo, OutputTrayInfo } from '../../../../shared/types/monitor';

export default function MediaTab({ inputTrays, outputTrays }: { inputTrays: InputTrayInfo[] | undefined; outputTrays: OutputTrayInfo[] | undefined }) {
  return (
    <Card>
      <CardTitle icon={<Inbox size={16} />}>Bandejas de medios</CardTitle>
      {(inputTrays?.length || outputTrays?.length) ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="border-b border-line-100 bg-surface-table-head">
              <tr>
                <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Bandeja</th>
                <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Tipo</th>
                <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Tamaño de papel</th>
                <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Tipo de papel</th>
                <th className="px-3 py-2.5 text-right font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Capacidad</th>
                <th className="px-3 py-2.5 min-w-[120px] font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Nivel</th>
                <th className="px-3 py-2.5 font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-200">
              {(inputTrays ?? []).map(t => (
                <tr key={`in-${t.name}`} className="hover:bg-surface-avatar">
                  <td className="px-3 py-2 font-sans text-[12.5px] font-semibold text-ink-900">{t.name}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">Entrada</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{t.paperSize ?? '—'}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{t.paperType ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[11.5px] text-ink-700">{t.capacity != null ? `${fmtInt(t.capacity)} hojas` : '—'}</td>
                  <td className="px-3 py-2">{t.level != null ? <SupplyLevelBar pct={t.level} /> : <span className="font-sans text-[12.5px] text-ink-200">—</span>}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{t.status ?? '—'}</td>
                </tr>
              ))}
              {(outputTrays ?? []).map(t => (
                <tr key={`out-${t.name}`} className="hover:bg-surface-avatar">
                  <td className="px-3 py-2 font-sans text-[12.5px] font-semibold text-ink-900">{t.name}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">Salida</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">—</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">—</td>
                  <td className="px-3 py-2 text-right font-mono text-[11.5px] text-ink-700">{t.capacity != null ? String(t.capacity) : '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">{t.level != null ? `${t.level}%` : '—'}</td>
                  <td className="px-3 py-2 font-sans text-[12.5px] text-ink-700">{t.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-center font-sans text-[12.5px] text-ink-300">El equipo no reportó información de bandejas.</p>
      )}
    </Card>
  );
}
