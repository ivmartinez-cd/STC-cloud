import { Activity, AlertTriangle } from 'lucide-react';
import { Card, CardTitle } from './primitives';
import { fmtDateTime } from './format';
import { fmtDate, fmtInt, type SupplyRow, type UsageRate } from '../../../lib/supplies';
import type { DeviceDetailData } from '../../../types/deviceDetailPage';

export default function SuppliesTable({
  device,
  supplyRows,
  rate,
  compact = false,
}: {
  device: DeviceDetailData | null;
  supplyRows: SupplyRow[];
  rate: UsageRate;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardTitle icon={<Activity size={16} />} right={
        <span className="flex items-center gap-2">
          {device?.supply_origin === 'non_genuine' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-100 text-[10px] font-black uppercase tracking-wider" title="Al menos un cartucho detectado como no original">
              <AlertTriangle size={11} /> No original
            </span>
          )}
          <span className="text-xs font-bold opacity-90">{supplyRows.length} insumos reportados</span>
        </span>
      }>Consumibles actuales</CardTitle>
      {supplyRows.length ? (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-[11px] border-collapse min-w-[1100px]">
            <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
              <tr>
                <th className="px-2 py-2.5 w-6 text-center">#</th>
                <th className="px-2.5 py-2.5">Descripción</th>
                <th className="px-2.5 py-2.5">Tipo</th>
                <th className="px-2.5 py-2.5">Color</th>
                <th className="px-2.5 py-2.5 min-w-[120px]">Nivel actual</th>
                <th className="px-2.5 py-2.5">Estado</th>
                <th className="px-2.5 py-2.5">Part number</th>
                <th className="px-2.5 py-2.5">Nº pedido</th>
                <th className="px-2.5 py-2.5">Nº de serie</th>
                <th className="px-2.5 py-2.5 text-right">Págs. impresas</th>
                <th className="px-2.5 py-2.5 text-right">Págs. restantes</th>
                <th className="px-2.5 py-2.5 text-right">Días restantes</th>
                {!compact && <th className="px-2.5 py-2.5 text-right">Instalado</th>}
                {!compact && <th className="px-2.5 py-2.5 text-right">Último uso</th>}
                <th className="px-2.5 py-2.5 text-right">Última actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
              {supplyRows.map((r, i) => (
                <tr key={r.key} className="hover:bg-slate-50/90 transition-colors">
                  <td className="px-2 py-2 text-center text-slate-400 font-bold">{i + 1}</td>
                  <td className="px-2.5 py-2 font-bold text-slate-800 whitespace-nowrap">{r.description}</td>
                  <td className="px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap">{r.kind}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-700"><span className={`w-2 h-2 rounded-full ${r.colorClass}`} />{r.color}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    {r.percentage != null ? (
                      <div className="flex items-center gap-1.5 min-w-[110px]">
                        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${r.percentage <= 10 ? 'bg-rose-500' : r.colorClass} rounded-full transition-all duration-700`} style={{ width: `${Math.max(0, Math.min(100, r.percentage))}%` }} />
                        </div>
                        <span className="font-extrabold text-slate-800 shrink-0 text-[10px] w-8 text-right">{r.percentage}%</span>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{r.status ?? '—'}</td>
                  <td className="px-2.5 py-2 font-mono font-bold text-brand-hover whitespace-nowrap">{r.code ?? '—'}</td>
                  <td className="px-2.5 py-2 font-mono text-slate-600 whitespace-nowrap">{r.orderNumber ?? '—'}</td>
                  <td className="px-2.5 py-2 font-mono text-slate-700 whitespace-nowrap">{r.serial ?? '—'}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">{fmtInt(r.printed)}</td>
                  <td className="px-2.5 py-2 text-right font-black text-slate-800 whitespace-nowrap">{fmtInt(r.remainingPages)}</td>
                  <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap" title={rate.totalPerDay ? `Ritmo observado: ${fmtInt(rate.totalPerDay)} págs/día (${fmtInt(rate.spanDays)} días, ${rate.samples} lecturas)` : 'Sin historial suficiente para estimar'}>{fmtInt(r.remainingDays)}</td>
                  {!compact && <td className="px-2.5 py-2 text-right whitespace-nowrap">{fmtDate(r.firstInstallDate)}</td>}
                  {!compact && <td className="px-2.5 py-2 text-right whitespace-nowrap">{fmtDate(r.lastUseDate)}</td>}
                  <td className="px-2.5 py-2 text-right text-slate-500 whitespace-nowrap">{fmtDateTime(device?.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 font-bold text-xs">El agente no reportó consumibles para este equipo</div>
      )}
    </Card>
  );
}
