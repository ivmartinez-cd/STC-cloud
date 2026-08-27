import { useState } from 'react';
import { Download, FileText, BarChart2, Package } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { Device, MonitorData } from '../../../shared/types/monitor';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import ZoneLabel from '../../../shared/components/ZoneLabel';
import { BrandModal } from '../../../shared/components/BrandModal';
import HifiPagination from '../../../shared/components/HifiPagination';
import { useFitRows } from '../../../shared/hooks/useFitRows';
import { useClientPagination } from '../../../shared/hooks/useClientPagination';

interface Props {
  devices: Device[];
  monitor: MonitorData;
}

function exportReportCSV(devices: Device[], monitorName: string) {
  const today = new Date().toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const month = new Date().toLocaleDateString(APP_LOCALE, { month: 'long', year: 'numeric' });
  const lines = [
    `REPORTE EJECUTIVO — ${monitorName}`,
    `Generado: ${today} | Período: ${month}`,
    '',
    'SERIE;MODELO;MARCA;IP;VOL_MENSUAL_TOTAL;VOL_MENSUAL_MONO;VOL_MENSUAL_COLOR;CONTADOR_FISICO_TOTAL;CONTADOR_FISICO_MONO;CONTADOR_FISICO_COLOR;NEGRO%;CIAN%;MAGENTA%;AMARILLO%',
  ];
  for (const d of devices) {
    lines.push([
      d.serial_number ?? 'S/N', d.model ?? 'N/A', d.brand ?? 'N/A', d.ip_address ?? 'N/A',
      Number(d.monthly_pages ?? 0), Number(d.monthly_mono ?? 0), Number(d.monthly_color ?? 0),
      d.total_pages ?? 'N/A', d.mono_pages ?? 'N/A', d.color_pages ?? 'N/A',
      d.toner_black ?? 'N/A', d.toner_cyan ?? 'N/A', d.toner_magenta ?? 'N/A', d.toner_yellow ?? 'N/A',
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

// Mismo criterio de 3 niveles que `ALERT_TIER_STYLE` en el detalle de
// Dispositivo (handoff, transversal #1: sólo naranja institucional + grises).
const STATUS_STYLE: Record<TonerLevel, { bg: string; fg: string; dot: string }> = {
  ok:       { bg: 'bg-surface-avatar', fg: 'text-ink-650',   dot: 'bg-brand-gray' },
  warning:  { bg: 'bg-brand-soft',     fg: 'text-brand-accent', dot: 'bg-brand' },
  critical: { bg: 'bg-brand-soft',     fg: 'text-brand-accent', dot: 'bg-brand-severe' },
};
const STATUS_LABELS: Record<TonerLevel, string> = { ok: 'OK', warning: 'Advertencia', critical: 'Crítico' };

const TonerCell = ({ value }: { value: number | null | undefined }) => {
  if (value == null) return <span className="font-sans text-[11.5px] text-ink-200">—</span>;
  const lvl = tonerStatus(value);
  const barColor = lvl === 'critical' ? 'bg-brand-severe' : lvl === 'warning' ? 'bg-brand' : 'bg-brand-gray';
  return (
    <div className="flex items-center gap-2">
      <span className="block h-1.5 w-16 overflow-hidden rounded-[3px] bg-surface-track">
        <span className={`block h-full rounded-[3px] ${barColor}`} style={{ width: `${value}%` }} />
      </span>
      <span className="min-w-[28px] text-right font-montserrat text-[11px] font-semibold tabular-nums text-ink-600">{value}%</span>
    </div>
  );
};

interface ChartEntry { name: string; fullName: string; mono: number; color: number }

const ChartTooltip = ({ active, payload, label, data }: {
  active?: boolean; payload?: { dataKey: string; value: number; fill: string }[]; label?: string; data: ChartEntry[];
}) => {
  if (!active || !payload?.length) return null;
  const item = data.find(d => d.name === label);
  return (
    <div className="min-w-[190px] rounded-[5px] border border-line-100 bg-white p-3.5">
      <p className="mb-2.5 font-montserrat text-[9px] font-bold uppercase leading-snug tracking-[.13em] text-ink-300">{item?.fullName}</p>
      {payload.map(entry => (
        <div key={entry.dataKey} className="mb-1 flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 font-sans text-[12px] text-ink-600">
            <span className="block h-2 w-2 rounded-full" style={{ background: entry.fill }} />
            {entry.dataKey === 'mono' ? 'Monocromo' : 'Color'}
          </span>
          <span className="font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt(entry.value)}</span>
        </div>
      ))}
      <div className="mt-2.5 flex items-center justify-between border-t border-line-150 pt-2.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.13em] text-ink-300">Total</span>
        <span className="font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt((payload[0]?.value ?? 0) + (payload[1]?.value ?? 0))}</span>
      </div>
    </div>
  );
};

function KpiCard({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="rounded-[5px] border border-line-100 bg-white p-5">
      <span className="font-montserrat text-[8px] font-bold uppercase tracking-[.13em] text-ink-300">{label}</span>
      <p className={`mt-1.5 font-montserrat text-[30px] font-extrabold leading-none tracking-[-.02em] tabular-nums ${accent ? 'text-brand-severe' : 'text-ink-900'}`}>{value}</p>
      <p className="mt-1.5 font-sans text-[11.5px] text-ink-300">{note}</p>
    </div>
  );
}

const ReportsTabPanel = ({ devices, monitor }: Props) => {
  const [showExportModal, setShowExportModal] = useState(false);
  // La tabla de insumos es lo único que crece: KPIs y gráfico quedan fijos
  // arriba y las filas se paginan según el alto restante (27/08/2026).
  const fit = useFitRows({ estimate: 54, min: 2 });

  const totalDevices  = devices.length;
  const totalMono     = devices.reduce((s, d) => s + Number(d.monthly_mono  ?? 0), 0);
  const totalColor    = devices.reduce((s, d) => s + Number(d.monthly_color ?? 0), 0);
  const totalPages    = devices.reduce((s, d) => s + Number(d.monthly_pages ?? (Number(d.monthly_mono ?? 0) + Number(d.monthly_color ?? 0))), 0);
  const lowTonerCount = devices.filter(d => deviceTonerStatus(d) !== 'ok').length;

  const chartData: ChartEntry[] = devices.map(d => ({
    name: d.serial_number?.slice(-6) ?? d.model?.slice(0, 8) ?? 'N/A',
    fullName: `${d.model ?? 'N/A'} · ${d.serial_number ?? 'S/N'}`,
    mono: Number(d.monthly_mono ?? 0), color: Number(d.monthly_color ?? 0),
  }));
  const devicesWithToner = devices.filter(d => d.toner_black != null);
  const pager = useClientPagination(devicesWithToner, fit.rows);
  const top = [...devices].sort((a, b) => Number(b.monthly_pages ?? 0) - Number(a.monthly_pages ?? 0))[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* KPIs — handoff §5.15: cifras simples, sin iconos decorativos */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <KpiCard label="Equipos" value={fmt(totalDevices)} note="dispositivos activos" />
        <KpiCard label="Total páginas" value={fmt(totalPages)} note="volumen mensual procesado" />
        <KpiCard label="Distribución" value={`${totalPages > 0 ? Math.round((totalMono / totalPages) * 100) : 0}%`} note={`mono · ${totalPages > 0 ? Math.round((totalColor / totalPages) * 100) : 0}% color`} />
        <KpiCard label="Alertas" value={fmt(lowTonerCount)} note="consumibles bajos" accent={lowTonerCount > 0} />
      </div>

      {/* Reporte ejecutivo de uso */}
      <div className="rounded-[5px] border border-line-100 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line-150 px-5 py-3.5">
          <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Reporte ejecutivo de uso</span>
          {devices.length > 0 && (
            <button type="button" onClick={() => setShowExportModal(true)} className="flex items-center gap-2 rounded-[3px] border border-line-300 bg-white px-3.5 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-600 transition-colors duration-150 ease-in-out hover:bg-surface-btn-hover">
              <Download size={13} /> Exportar CSV
            </button>
          )}
        </div>
        <div className="px-5 pb-4 pt-3">
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <BarChart2 size={32} className="text-ink-200" />
              <p className="font-sans text-[12.5px] text-ink-300">Sin datos de uso disponibles</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="40%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#A5AAAD', letterSpacing: '0.06em' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#A5AAAD' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip cursor={{ fill: 'rgba(88,89,91,0.06)' }} content={<ChartTooltip data={chartData} />} />
                  <Legend iconType="circle" iconSize={8} formatter={(value: string) => (
                    <span className="ml-1 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-ink-300">{value === 'mono' ? 'Monocromo' : 'Color'}</span>
                  )} />
                  <Bar dataKey="mono" fill="#58595B" radius={[2, 2, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="color" fill="#F7941D" radius={[2, 2, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>

              {top && Number(top.monthly_pages ?? 0) > 0 && (
                <div className="mt-3 flex items-center gap-4 rounded-[3px] border border-brand-chip-border bg-brand-soft px-4 py-2">
                  <p className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-ink-900">
                    <span className="mr-2 font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-brand-accent">Mayor productor del mes</span>
                    <span className="font-semibold">{top.model ?? 'N/A'}</span> · <span className="font-mono text-[12px] text-brand-accent">{top.serial_number ?? 'S/N'}</span>
                  </p>
                  <p className="shrink-0 font-montserrat text-[16px] font-bold tabular-nums text-ink-900">{fmt(Number(top.monthly_pages ?? 0))} <span className="font-sans text-[11px] font-normal text-ink-300">pág. este mes</span></p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reporte de insumos */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <ZoneLabel text={`Reporte de insumos · ${fmt(devicesWithToner.length)}`} lineColorClass="bg-brand" />
          {devicesWithToner.length > 0 && (
            <span className={`inline-flex items-center gap-[7px] rounded-[2px] px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${STATUS_STYLE[lowTonerCount > 0 ? 'warning' : 'ok'].bg} ${STATUS_STYLE[lowTonerCount > 0 ? 'warning' : 'ok'].fg}`}>
              <span className={`block h-1.5 w-1.5 rounded-full ${STATUS_STYLE[lowTonerCount > 0 ? 'warning' : 'ok'].dot}`} />
              {lowTonerCount > 0 ? `${lowTonerCount} alerta${lowTonerCount > 1 ? 's' : ''}` : 'Todo OK'}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col rounded-[5px] border border-line-100 bg-white">
          {devicesWithToner.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Package size={32} className="text-ink-200" />
              <p className="font-sans text-[12.5px] text-ink-300">Sin datos de consumibles disponibles</p>
            </div>
          ) : (
            <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 900 }}>
                <div role="row" data-fit-fixed className="grid grid-cols-[minmax(180px,1fr)_110px_140px_110px_90px_90px_90px_90px] items-center gap-3.5 border-b border-line-100 bg-surface-table-head px-5 py-3">
                  {['MODELO', 'MARCA', 'S/N', 'ESTADO', 'NEGRO', 'CIAN', 'MAGENTA', 'AMARILLO'].map((h) => (
                    <span key={h} className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.14em] text-ink-300">{h}</span>
                  ))}
                </div>
                {pager.visible.map((device) => {
                  const status = deviceTonerStatus(device);
                  const s = STATUS_STYLE[status];
                  return (
                    <div key={device.id} role="row" data-fit-row className="grid min-h-[54px] grid-cols-[minmax(180px,1fr)_110px_140px_110px_90px_90px_90px_90px] items-center gap-3.5 border-b border-line-200 px-5 py-[11px] last:border-0">
                      <span className="truncate font-sans text-[12.5px] font-semibold text-ink-900">{device.model ?? 'N/A'}</span>
                      <span className="font-sans text-[12px] text-ink-400">{device.brand ?? 'N/A'}</span>
                      <span className="font-mono text-[11.5px] text-ink-700">{device.serial_number ?? 'S/N'}</span>
                      <span className={`inline-flex items-center gap-[7px] justify-self-start rounded-[2px] ${s.bg} px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] ${s.fg}`}>
                        <span className={`block h-1.5 w-1.5 rounded-full ${s.dot}`} />{STATUS_LABELS[status]}
                      </span>
                      <TonerCell value={device.toner_black} />
                      <TonerCell value={device.toner_cyan} />
                      <TonerCell value={device.toner_magenta} />
                      <TonerCell value={device.toner_yellow} />
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}
          {devicesWithToner.length > pager.pageSize && (
            <HifiPagination page={pager.page} totalPages={pager.totalPages} total={pager.total} pageSize={pager.pageSize} itemLabel="equipos" onPageChange={pager.setPage} />
          )}
        </div>
      </div>

      <BrandModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Exportar reporte" widthPx={400}>
        <p className="mb-4 font-sans text-[12.5px] text-ink-400">Formato CSV completo del reporte ejecutivo.</p>
        <button
          type="button" onClick={() => { exportReportCSV(devices, monitor.name); setShowExportModal(false); }}
          className="flex w-full items-center justify-center gap-2.5 rounded-[3px] bg-brand px-4 py-3 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
        >
          <FileText size={15} /> Reporte ejecutivo completo
        </button>
      </BrandModal>
    </div>
  );
};

export default ReportsTabPanel;
