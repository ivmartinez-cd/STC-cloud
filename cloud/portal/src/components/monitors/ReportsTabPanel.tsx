import { useState } from 'react';
import {
  Download, FileText, BarChart2, Package,
  Printer, TrendingUp, AlertTriangle, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { Device, MonitorData } from '../../types/monitor';

interface Props {
  devices: Device[];
  monitor: MonitorData;
}

function exportReportCSV(devices: Device[], monitorName: string) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const month = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const lines = [
    `REPORTE EJECUTIVO — ${monitorName}`,
    `Generado: ${today} | Período: ${month}`,
    '',
    'SERIE;MODELO;MARCA;IP;VOL_MENSUAL_TOTAL;VOL_MENSUAL_MONO;VOL_MENSUAL_COLOR;CONTADOR_FISICO_TOTAL;CONTADOR_FISICO_MONO;CONTADOR_FISICO_COLOR;NEGRO%;CIAN%;MAGENTA%;AMARILLO%',
  ];
  for (const d of devices) {
    lines.push([
      d.serial_number ?? 'S/N',
      d.model ?? 'N/A',
      d.brand ?? 'N/A',
      d.ip_address ?? 'N/A',
      Number(d.monthly_pages ?? 0),
      Number(d.monthly_mono ?? 0),
      Number(d.monthly_color ?? 0),
      d.total_pages ?? 'N/A',
      d.mono_pages ?? 'N/A',
      d.color_pages ?? 'N/A',
      d.toner_black ?? 'N/A',
      d.toner_cyan ?? 'N/A',
      d.toner_magenta ?? 'N/A',
      d.toner_yellow ?? 'N/A',
    ].join(';'));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_ejecutivo_${monitorName.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type TonerLevel = 'ok' | 'warning' | 'critical';

function tonerStatus(pct: number | null | undefined): TonerLevel {
  if (pct == null) return 'ok';
  if (pct <= 10) return 'critical';
  if (pct <= 20) return 'warning';
  return 'ok';
}

function deviceTonerStatus(d: Device): TonerLevel {
  const levels = [d.toner_black, d.toner_cyan, d.toner_magenta, d.toner_yellow].filter(x => x != null);
  if (levels.length === 0) return 'ok';
  if (levels.some(l => tonerStatus(l) === 'critical')) return 'critical';
  if (levels.some(l => tonerStatus(l) === 'warning')) return 'warning';
  return 'ok';
}

const STATUS_STYLES: Record<TonerLevel, string> = {
  ok:       'bg-emerald-50 text-emerald-600 border-emerald-100',
  warning:  'bg-amber-50  text-amber-600  border-amber-100',
  critical: 'bg-rose-50   text-rose-600   border-rose-100',
};
const STATUS_LABELS: Record<TonerLevel, string> = {
  ok: 'OK', warning: 'Advertencia', critical: 'Crítico',
};

/* ─── Toner progress cell ────────────────────────────────────────── */
interface TonerCellProps {
  value: number | null | undefined;
  colorClass: string;
}

const TonerCell = ({ value, colorClass }: TonerCellProps) => {
  if (value == null) return <span className="text-[10px] text-slate-300 font-bold">-</span>;
  const lvl = tonerStatus(value);
  const bgClass = lvl === 'critical' ? 'bg-rose-400' : lvl === 'warning' ? 'bg-amber-400' : colorClass;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 sm:w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/50">
        <div className={`h-full rounded-full transition-all duration-700 ${bgClass}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[9px] font-bold text-slate-500 w-6 text-right">{value}%</span>
    </div>
  );
};

/* ─── Custom chart tooltip ───────────────────────────────────────── */
interface ChartEntry { name: string; fullName: string; mono: number; color: number }

const ChartTooltip = ({
  active, payload, label, data,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; fill: string }[];
  label?: string;
  data: ChartEntry[];
}) => {
  if (!active || !payload?.length) return null;
  const item = data.find(d => d.name === label);
  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/10 border border-slate-100 p-4 min-w-[190px]">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 leading-snug">
        {item?.fullName}
      </p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 mb-1">
          <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.fill }} />
            {entry.dataKey === 'mono' ? 'Monocromo' : 'Color'}
          </span>
          <span className="text-xs font-black text-[#1a2333] tabular-nums">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
        <span className="text-xs font-black text-[#1a2333] tabular-nums">
          {((payload[0]?.value ?? 0) + (payload[1]?.value ?? 0)).toLocaleString()}
        </span>
      </div>
    </div>
  );
};

/* ─── Main component ─────────────────────────────────────────────── */
const ReportsTabPanel = ({ devices, monitor }: Props) => {
  const [showExportModal, setShowExportModal] = useState(false);

  const totalDevices   = devices.length;
  const totalMono      = devices.reduce((s, d) => s + Number(d.monthly_mono  ?? 0), 0);
  const totalColor     = devices.reduce((s, d) => s + Number(d.monthly_color ?? 0), 0);
  const totalPages     = devices.reduce((s, d) => s + Number(d.monthly_pages ?? (Number(d.monthly_mono ?? 0) + Number(d.monthly_color ?? 0))), 0);
  const lowTonerCount  = devices.filter(d => deviceTonerStatus(d) !== 'ok').length;

  const chartData: ChartEntry[] = devices.map(d => ({
    name:     d.serial_number?.slice(-6) ?? d.model?.slice(0, 8) ?? 'N/A',
    fullName: `${d.model ?? 'N/A'} · ${d.serial_number ?? 'S/N'}`,
    mono:     Number(d.monthly_mono  ?? 0),
    color:    Number(d.monthly_color ?? 0),
  }));

  const devicesWithToner = devices.filter(d => d.toner_black != null);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">

      {/* ── Panel header + KPI cards ─────────────────────────────── */}
      <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5">
        <header className="px-8 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Reportes del Nodo</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Análisis ejecutivo de uso e insumos</p>
          </div>
          {devices.length > 0 && (
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors border border-emerald-200"
            >
              <Download size={13} /> Exportar CSV
            </button>
          )}
        </header>

        <div className="px-8 py-8 bg-white">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3 group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-[#004a99] rounded-xl">
                  <Printer size={18} />
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipos</span>
              </div>
              <p className="text-4xl font-black text-[#1a2333] tracking-tighter tabular-nums">{totalDevices}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dispositivos activos</p>
            </div>

            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3 group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#004a99]/10 text-[#004a99] rounded-xl">
                  <TrendingUp size={18} />
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Páginas</span>
              </div>
              <p className="text-4xl font-black text-[#1a2333] tracking-tighter tabular-nums">{totalPages.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Volumen mensual (págs. procesadas)</p>
            </div>

            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3 group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
                  <BarChart2 size={18} />
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Distribución</span>
              </div>
              <p className="text-4xl font-black text-[#1a2333] tracking-tighter tabular-nums">
                {totalPages > 0 ? Math.round((totalMono / totalPages) * 100) : 0}
                <span className="text-xl text-slate-400">%</span>
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Mono · {totalPages > 0 ? Math.round((totalColor / totalPages) * 100) : 0}% Color
              </p>
            </div>

            <div className={`p-6 rounded-3xl border space-y-3 group hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${
              lowTonerCount > 0 ? 'bg-amber-50/80 border-amber-100' : 'bg-slate-50 border-slate-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${lowTonerCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <AlertTriangle size={18} />
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alertas</span>
              </div>
              <p className={`text-4xl font-black tracking-tighter tabular-nums ${lowTonerCount > 0 ? 'text-amber-700' : 'text-[#1a2333]'}`}>
                {lowTonerCount}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consumibles bajos</p>
            </div>

          </div>
        </div>
      </div>

      {/* ── Reporte Ejecutivo de Uso ──────────────────────────────── */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-blue-900/5 overflow-hidden">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-[#004a99] rounded-2xl">
            <BarChart2 size={22} />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Reporte Ejecutivo de Uso</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Distribución de impresiones por dispositivo</p>
          </div>
        </header>

        <div className="p-8">
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <BarChart2 size={48} className="text-slate-200" />
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Sin datos de uso disponibles</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                  barCategoryGap="40%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8', letterSpacing: '0.06em' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,74,153,0.04)', radius: 12 }}
                    content={<ChartTooltip data={chartData} />}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">
                        {value === 'mono' ? 'Monocromo' : 'Color'}
                      </span>
                    )}
                  />
                  <Bar dataKey="mono"  fill="#004a99" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="color" fill="#f7931d" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>

              {/* Top producer highlight */}
              {(() => {
                const top = [...devices].sort((a, b) =>
                  Number(b.monthly_pages ?? 0) - Number(a.monthly_pages ?? 0)
                )[0];
                if (!top || Number(top.monthly_pages ?? 0) === 0) return null;
                return (
                  <div className="mt-6 flex items-center gap-4 p-5 bg-[#004a99]/5 rounded-2xl border border-[#004a99]/10">
                    <div className="p-3 bg-[#004a99]/10 text-[#004a99] rounded-xl">
                      <TrendingUp size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mayor Productor del Mes</p>
                      <p className="text-sm font-black text-[#1a2333] tracking-tight">
                        {top.model ?? 'N/A'} · <span className="font-mono text-[#004a99]">{top.serial_number ?? 'S/N'}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-[#1a2333] tabular-nums tracking-tighter">
                        {Number(top.monthly_pages ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">páginas este mes</p>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* ── Reporte de Insumos ───────────────────────────────────── */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-blue-900/5 overflow-hidden">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Package size={22} />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#1a2333] uppercase tracking-tight">Reporte de Insumos</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estado de consumibles por dispositivo</p>
            </div>
          </div>
          {devicesWithToner.length > 0 && (
            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
              lowTonerCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
              {lowTonerCount > 0 ? `${lowTonerCount} alerta${lowTonerCount > 1 ? 's' : ''}` : 'Todo OK'}
            </span>
          )}
        </header>

        <div className="p-8">
          {devicesWithToner.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Package size={48} className="text-slate-200" />
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Sin datos de consumibles disponibles</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Modelo</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Marca</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">S/N</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Negro</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cian</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Magenta</th>
                    <th className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Amarillo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devicesWithToner.map(device => {
                    const status  = deviceTonerStatus(device);
                    return (
                      <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-4 text-[10px] text-[#1a2333] font-bold">
                          {device.model ?? 'N/A'}
                        </td>
                        <td className="py-2 px-4 text-[10px] text-slate-500 font-medium uppercase">
                          {device.brand ?? 'N/A'}
                        </td>
                        <td className="py-2 px-4 text-[10px] text-slate-500 font-mono">
                          {device.serial_number ?? 'S/N'}
                        </td>
                        <td className="py-2 px-4">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${STATUS_STYLES[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                        </td>
                        <td className="py-2 px-4">
                          <TonerCell value={device.toner_black} colorClass="bg-slate-800" />
                        </td>
                        <td className="py-2 px-4">
                          <TonerCell value={device.toner_cyan} colorClass="bg-[#00adef]" />
                        </td>
                        <td className="py-2 px-4">
                          <TonerCell value={device.toner_magenta} colorClass="bg-[#ec008c]" />
                        </td>
                        <td className="py-2 px-4">
                          <TonerCell value={device.toner_yellow} colorClass="bg-[#f5c400]" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Export Modal ─────────────────────────────────────────── */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowExportModal(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-[32px] shadow-2xl shadow-black/20 w-full max-w-sm p-8 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <Download size={22} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#1a2333] tracking-tight">Exportar Reporte</h3>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Formato CSV completo</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <button
                onClick={() => { exportReportCSV(devices, monitor.name); setShowExportModal(false); }}
                className="w-full py-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors text-sm font-black text-emerald-700 flex items-center justify-center gap-3"
              >
                <FileText size={16} /> Reporte Ejecutivo Completo
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full py-3 rounded-2xl text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsTabPanel;
