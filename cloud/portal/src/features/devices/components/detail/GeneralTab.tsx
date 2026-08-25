import { Printer, Info, AlertTriangle, TrendingUp, FileText, Clock, Tag } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { Card, CardTitle, Row, DeviceImage } from './primitives';
import { POLL_LABEL, fmtDateTime } from './format';
import CountersCard from './CountersCard';
import SuppliesTable from './SuppliesTable';
import { fmtInt, type SupplyRow, type UsageRate } from '../../../../shared/lib/supplies';
import type { DetailedCounters, DeviceExtraInfo } from '../../../../shared/types/monitor';
import type { CustomFieldDef } from '../../../../shared/types/inventory';
import type { ActiveAlertItem, DeviceDetailData, Reading } from '../../types/deviceDetailPage';

interface GeneralTabProps {
  device: DeviceDetailData;
  isAgentOnline: boolean;
  extra: DeviceExtraInfo | undefined;
  customFieldDefs: CustomFieldDef[];
  readingsCount: number;
  chartData: { time: string; Total: number; Mono: number; Color: number }[];
  isColorDevice: boolean;
  rate: UsageRate;
  totalPages: number | null;
  monoPages: number | null;
  colorPages: number | null;
  latest: Reading | null;
  counters: DetailedCounters | undefined;
  supplyRows: SupplyRow[];
  activeAlerts: ActiveAlertItem[];
}

export default function GeneralTab({
  device, isAgentOnline, extra, customFieldDefs, readingsCount, chartData, isColorDevice,
  rate, totalPages, monoPages, colorPages, latest, counters, supplyRows, activeAlerts,
}: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Foto */}
        <Card className="xl:col-span-3">
          <CardTitle icon={<Printer size={16} />}>{device.serial_number ?? device.ip_address}</CardTitle>
          <div className="p-5 flex flex-col items-center gap-3">
            <div className="w-full h-48 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
              <DeviceImage brand={device.brand} model={device.model} />
            </div>
            <p className="text-xs font-black text-slate-800 text-center">{device.model ?? '—'}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{device.brand ?? '—'}</p>
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className={`w-2 h-2 rounded-full ${isAgentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-600">{isAgentOnline ? 'Monitor en línea' : 'Monitor sin contacto'}</span>
            </div>
          </div>
        </Card>

        {/* Datos del dispositivo */}
        <Card className="xl:col-span-5">
          <CardTitle icon={<Info size={16} />}>Datos del dispositivo</CardTitle>
          <div>
            <Row label="ID de dispositivo" value={device.id.slice(0, 8)} mono />
            <Row
              label="Nombre"
              value={device.name_override ? <>{device.name}<span className="ml-1 text-[9px] font-bold text-brand">(manual)</span></> : device.name}
            />
            <Row label="Fecha de descubrimiento" value={fmtDateTime(device.created_at)} />
            <Row label="Última actualización" value={<span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${isAgentOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />{fmtDateTime(device.last_seen)}</span>} />
            <Row label="Número de serie" value={device.serial_number ?? '—'} mono />
            <Row label="Dirección IP" value={device.ip_address} mono />
            <Row label="Nombre del host" value={device.hostname ?? extra?.dnsName ?? '—'} mono />
            {extra?.alias && extra.alias !== device.hostname && <Row label="Alias" value={extra.alias} />}
            <Row label="Dirección MAC" value={device.mac ? String(device.mac).toUpperCase() : '—'} mono />
            <Row label="Firmware" value={device.firmware ?? '—'} mono />
            {extra?.firmwarePackage && <Row label="Paquete de firmware" value={extra.firmwarePackage} mono />}
            {extra?.platform && <Row label="Plataforma" value={extra.platform} />}
            <Row
              label="Ubicación"
              value={device.location_override ? <>{device.location}<span className="ml-1 text-[9px] font-bold text-brand">(manual)</span></> : (device.location ?? '—')}
            />
            <Row label="Fabricante" value={extra?.manufacturer ?? device.brand ?? '—'} />
            <Row label="Modelo" value={device.model ?? '—'} />
            <Row label="SKU / Nº de producto" value={device.sku ?? extra?.sku ?? '—'} mono />
            {extra?.formatterNumber && <Row label="Nº de formateador" value={extra.formatterNumber} mono />}
            {extra?.ramMb != null && <Row label="Memoria RAM" value={`${fmtInt(extra.ramMb)} MB`} />}
            <Row label="Método de lectura" value={POLL_LABEL[device.poll_method ?? 'unknown'] ?? device.poll_method} />
            <Row label="Cliente / Monitor" value={`${device.client_name ?? ''} · ${device.monitor_name ?? ''}`} muted />
          </div>
        </Card>

        {/* Recuentos + alertas */}
        <div className="xl:col-span-4 space-y-6">
          <CountersCard device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />
          <Card>
            <CardTitle icon={<AlertTriangle size={16} />}>Alertas actuales</CardTitle>
            {activeAlerts.length ? (
              <ul className="divide-y divide-slate-100">
                {activeAlerts.map(a => (
                  <li key={a.key} className="px-4 py-2 flex items-start gap-2 text-[11px]">
                    <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black ${a.severity === 'ERROR' || a.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : a.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.severity}</span>
                    <span className="font-semibold text-slate-700">{a.message}{a.code ? <span className="text-slate-400 font-mono"> · {a.code}</span> : null}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[11px] font-semibold text-slate-500">No hay alertas actuales para este dispositivo.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Inventario (Fase 4 del gap analysis vs HP SDS) */}
      <Card>
        <CardTitle icon={<Tag size={16} />}>Inventario</CardTitle>
        <div>
          <Row
            label="Nº de activo"
            value={device.asset_number ? (
              <>{device.asset_number}<span className="ml-1 text-[9px] font-bold text-brand">{device.asset_number_override ? '(manual)' : '(reportado)'}</span></>
            ) : '—'}
            mono
          />
          <Row label="Nº de etiqueta" value={device.asset_tag ?? '—'} mono />
          <Row
            label="Ciclos de trabajo"
            value={device.duty_cycle_effective != null ? (
              <>{fmtInt(device.duty_cycle_effective)} pág/mes<span className="ml-1 text-[9px] font-bold text-slate-400">{device.duty_cycle_monthly_override ? '(manual)' : '(catálogo)'}</span></>
            ) : '—'}
          />
          <Row
            label="Uso últimos 30 días"
            value={device.pages_30d != null ? (
              <span className="inline-flex items-center gap-2">
                {fmtInt(device.pages_30d)} pág.
                {device.utilization_pct != null && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                    device.utilization_pct > 100 ? 'bg-rose-100 text-rose-700' : device.utilization_pct > 80 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{device.utilization_pct}% del ciclo</span>
                )}
              </span>
            ) : '—'}
          />
          {customFieldDefs.map((def) => {
            const data = typeof device.custom_data === 'string' ? JSON.parse(device.custom_data) : (device.custom_data ?? {});
            const raw = (data as Record<string, unknown>)[def.key];
            const value = raw == null ? '—' : def.type === 'boolean' ? (raw ? 'Sí' : 'No') : String(raw);
            return <Row key={def.id} label={def.label} value={value} />;
          })}
        </div>
      </Card>

      {/* Tendencia + estado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 cd-panel p-6 bg-white border border-slate-100 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-extrabold text-[#1a2333] text-base flex items-center gap-2"><TrendingUp size={18} className="text-brand" />Tendencia de impresión</h3>
            <span className="text-[10px] font-extrabold px-3 py-1 bg-slate-100 text-slate-500 rounded-full uppercase tracking-widest">Últimas {Math.min(readingsCount, 48)} lecturas</span>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0080FF" stopOpacity={0.2} /><stop offset="95%" stopColor="#0080FF" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderRadius: '16px', color: '#FFF', border: 'none' }} itemStyle={{ color: '#FFF', fontSize: '12px', fontWeight: 800 }} labelStyle={{ color: '#94A3B8', fontSize: '10px', fontWeight: 700 }} />
                <Area type="monotone" dataKey="Total" stroke="#0080FF" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                {isColorDevice && <Area type="monotone" dataKey="Color" stroke="#F7931D" strokeWidth={2} fillOpacity={0} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm mb-4"><FileText size={18} /><span>Contadores actuales</span></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Total acumulado</p>
            <p className="text-4xl font-black tracking-tight mt-1">{fmtInt(totalPages)}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 bg-white/10 rounded-xl"><p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Monocromo</p><p className="text-xl font-black">{fmtInt(monoPages)}</p></div>
              <div className="p-3 bg-white/10 rounded-xl"><p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Color</p><p className="text-xl font-black">{fmtInt(colorPages)}</p></div>
            </div>
            <div className="pt-4 mt-4 border-t border-amber-400/30 flex items-center justify-between text-[10px] font-bold text-amber-100">
              <span>LECTURA</span><span>{fmtDateTime(latest?.time ?? device.last_seen)}</span>
            </div>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center gap-4">
            <div className="p-3 bg-brand/10 text-brand rounded-xl"><Clock size={20} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ritmo de impresión</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{rate.totalPerDay != null ? `${fmtInt(rate.totalPerDay)} págs/día` : 'Sin historial suficiente'}</p>
              {rate.spanDays != null && <p className="text-[10px] text-slate-400 font-medium">{fmtInt(rate.spanDays)} días · {rate.samples} lecturas</p>}
            </div>
          </div>
        </div>
      </div>

      <SuppliesTable device={device} supplyRows={supplyRows} rate={rate} compact />
    </div>
  );
}
