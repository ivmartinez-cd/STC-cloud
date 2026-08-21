import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Printer, RefreshCw, Activity, Layers, Trash2, AlertTriangle, Inbox,
  TrendingUp, Clock, FileText, Cpu, Info, ScanLine, Copy, Phone,
} from 'lucide-react';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import type { Device, SuppliesDetails, CounterTriple } from '../types/monitor';
import { parseSuppliesDetails, buildSupplyRows, usageRate, fmtDate, fmtInt, type SupplyRow, type ReadingPoint } from '../lib/supplies';
import { deviceImageCandidates } from '../lib/deviceImage';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface Reading extends ReadingPoint {
  id: string;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
}

/** Respuesta de GET /devices/:id (devices.* + joins de agente/cliente). */
interface DeviceDetailData extends Device {
  monitor_name?:    string;
  client_name?:     string;
  client_id?:       string;
  agent_status?:    string;
  agent_last_seen?: string | null;
  status?:          string;
}

interface DeviceAlert {
  id: string;
  device_id: string;
  deviceId?: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

type Tab = 'general' | 'counters' | 'supplies' | 'media' | 'alerts';

// ─── Helpers de presentación ─────────────────────────────────────────────────

const fmtDateTime = (v: string | null | undefined): string =>
  v ? new Date(v).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const POLL_LABEL: Record<string, string> = { ews: 'EWS (web embebida)', snmp: 'SNMP', pjl: 'PJL (9100)', ipp: 'IPP (631)', unknown: '—' };

/** Fila "etiqueta → valor" de las tarjetas de datos (estilo SDS). */
const Row = ({ label, value, mono = false, muted = false }: { label: string; value: ReactNode; mono?: boolean; muted?: boolean }) => (
  <div className="flex items-start justify-between gap-4 px-4 py-2 odd:bg-slate-50/70">
    <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">{label}</span>
    <span className={`text-[11px] text-right font-semibold ${muted ? 'text-slate-400' : 'text-slate-800'} ${mono ? 'font-mono' : ''} break-all`}>{value ?? '—'}</span>
  </div>
);

const CardTitle = ({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between">
    <div className="flex items-center gap-2">{icon}<h4 className="text-sm font-black tracking-wide">{children}</h4></div>
    {right}
  </div>
);

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`cd-panel bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs ${className}`}>{children}</div>
);

/** Foto del equipo con cadena de fallbacks (ver public/devices/README.md). */
const DeviceImage = ({ brand, model }: { brand: string | null; model: string | null }) => {
  const candidates = useMemo(() => deviceImageCandidates(brand, model), [brand, model]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [candidates]);
  const src = candidates[Math.min(idx, candidates.length - 1)];
  return (
    <img
      src={src}
      alt={model ?? 'Dispositivo'}
      className="max-h-44 w-auto object-contain drop-shadow-sm"
      onError={() => setIdx(i => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
};

const TripleRows = ({ label, t }: { label: string; t: CounterTriple | undefined }) => {
  if (!t) return null;
  return (
    <>
      <Row label={`${label} — monocromo`} value={fmtInt(t.mono)} />
      <Row label={`${label} — color`} value={fmtInt(t.color)} />
      <Row label={`${label} — total`} value={fmtInt(t.total)} />
    </>
  );
};

// ─── Página ──────────────────────────────────────────────────────────────────

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [device, setDevice]     = useState<DeviceDetailData | null>(null);
  const [alerts, setAlerts]     = useState<DeviceAlert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [now] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<DeviceDetailData>(`/devices/${id}`),
      // 400 lecturas alcanzan para ~1 semana de historial con los loops actuales → ritmo de impresión real
      api.get<Reading[]>(`/devices/${id}/readings?limit=400`),
      api.get<DeviceAlert[]>(`/alerts?device_id=${id}`).catch(() => [] as DeviceAlert[]),
    ])
      .then(([deviceData, readingsData, alertsData]) => {
        setDevice(deviceData);
        setReadings(Array.isArray(readingsData) ? readingsData : []);
        setAlerts(Array.isArray(alertsData) ? alertsData : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const latest = readings[0] ?? null;
  const details: SuppliesDetails | null = useMemo(() => parseSuppliesDetails(device?.supplies_details), [device?.supplies_details]);
  const rate = useMemo(() => usageRate(readings), [readings]);
  const supplyRows: SupplyRow[] = useMemo(() => (device ? buildSupplyRows(device, details, rate) : []), [device, details, rate]);
  const counters = details?.counters;
  const extra = details?.device;

  const chartData = useMemo(() => [...readings].slice(0, 48).reverse().map(r => ({
    time:  new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Total: r.total_pages ?? 0,
    Mono:  r.mono_pages ?? 0,
    Color: r.color_pages ?? 0,
  })), [readings]);

  const isAgentOnline = device !== null
    && device.agent_status === 'active'
    && !!device.agent_last_seen
    && (now - new Date(device.agent_last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

  const handleDelete = async () => {
    setDeleting(true); setDeleteError(null);
    try {
      await api.delete(`/devices/${id}`);
      navigate('/devices');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = latest?.total_pages ?? device?.total_pages ?? null;
  const monoPages  = latest?.mono_pages  ?? device?.mono_pages  ?? null;
  const colorPages = latest?.color_pages ?? device?.color_pages ?? null;
  const isColorDevice = (colorPages ?? 0) > 0 || supplyRows.some(r => r.kind === 'Tóner' && r.color !== 'Negro');

  // Alertas activas: del servidor + las que reporta el equipo (supplies_details.alerts), deduplicadas
  const activeAlerts = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; severity: string; message: string; code?: string; time?: string }> = [];
    for (const a of details?.alerts ?? []) {
      const key = `${a.code ?? ''}|${(a.description ?? '').toLowerCase()}`;
      if (!a.description && !a.code) continue;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ key: `dev-${key}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.description ?? a.code ?? '', code: a.code, time: a.time });
    }
    for (const a of alerts.filter(x => !x.resolved && (x.device_id === id || x.deviceId === id))) {
      const key = `${(a.type ?? '').toLowerCase()}|${(a.message ?? '').toLowerCase()}`;
      if (seen.has(key) || [...seen].some(k => k.endsWith(`|${(a.message ?? '').toLowerCase()}`))) continue; seen.add(key);
      out.push({ key: `srv-${a.id}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.message, code: a.type, time: a.timestamp });
    }
    return out;
  }, [details?.alerts, alerts, id]);

  const tabBtn = (tab: Tab, icon: ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
        activeTab === tab ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
      }`}
    >
      {icon}{label}
    </button>
  );

  // ── Tarjetas reutilizables ────────────────────────────────────────────────

  const SuppliesTable = ({ compact = false }: { compact?: boolean }) => (
    <Card>
      <CardTitle icon={<Activity size={16} />} right={<span className="text-xs font-bold opacity-90">{supplyRows.length} insumos reportados</span>}>Consumibles actuales</CardTitle>
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
                  <td className="px-2.5 py-2 font-mono font-bold text-sky-700 whitespace-nowrap">{r.code ?? '—'}</td>
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

  const CountersCard = () => (
    <Card>
      <CardTitle icon={<FileText size={16} />}>Últimos recuentos de páginas</CardTitle>
      <div className="divide-y divide-slate-100">
        <Row label="Páginas monocromáticas" value={fmtInt(monoPages)} />
        <Row label="Páginas a color" value={fmtInt(colorPages)} />
        <Row label="Número total de páginas" value={<span className="text-sky-700 font-black">{fmtInt(totalPages)}</span>} />
        {counters?.equivalentA4 && <TripleRows label="Equivalente A4" t={counters.equivalentA4} />}
        {counters?.print && <Row label="Impresiones" value={fmtInt(counters.print.total)} />}
        {counters?.copy && <Row label="Copias" value={fmtInt(counters.copy.total)} />}
        {counters?.fax && (counters.fax.total ?? 0) > 0 && <Row label="Fax" value={fmtInt(counters.fax.total)} />}
        {counters?.scans && <Row label="Escaneos" value={fmtInt(counters.scans.total)} />}
        {counters?.engineCycles != null && <Row label="Ciclos del motor" value={fmtInt(counters.engineCycles)} />}
        {counters?.totalImpressions && <Row label="Impresiones totales (print/report)" value={`${fmtInt(counters.totalImpressions.print)} / ${fmtInt(counters.totalImpressions.report)}`} />}
        <Row label="Última actualización" value={fmtDateTime(latest?.time ?? device?.last_seen)} muted />
      </div>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Breadcrumb + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 px-6 rounded-2xl border border-slate-100 shadow-xs text-xs font-bold text-slate-500">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/" className="text-slate-400 hover:text-brand transition-colors hover:underline">Canal Directo</Link>
          <span className="text-slate-300">›</span>
          {device?.client_id ? <Link to={`/clients/${device.client_id}`} className="text-slate-600 hover:text-brand hover:underline">{device.client_name || 'Cliente'}</Link> : <span className="text-slate-600">{device?.client_name || 'Cliente'}</span>}
          <span className="text-slate-300">›</span>
          {device?.agent_id ? <Link to={`/monitors/${device.agent_id}`} className="text-slate-600 hover:text-brand hover:underline">{device.monitor_name || 'Monitor'}</Link> : <span className="text-slate-600">{device?.monitor_name || 'Monitor'}</span>}
          <span className="text-slate-300">›</span>
          <span className="bg-slate-100 text-slate-800 font-extrabold px-2.5 py-1 rounded-lg">{device?.serial_number || device?.ip_address || 'Dispositivo'}</span>
        </div>
        <div className="flex items-center gap-3">
          {device && (
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 text-xs font-bold transition-all">
              <Trash2 size={14} /> Eliminar
            </button>
          )}
          <button onClick={load} disabled={loading} className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all disabled:opacity-40" title="Actualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        {tabBtn('general', <Layers size={15} />, 'Vista General')}
        {tabBtn('counters', <TrendingUp size={15} />, 'Recuentos')}
        {tabBtn('supplies', <Activity size={15} />, 'Consumibles')}
        {tabBtn('media', <Inbox size={15} />, 'Medios (Bandejas)')}
        {tabBtn('alerts', <AlertTriangle size={15} />, `Alertas${activeAlerts.length ? ` (${activeAlerts.length})` : ''}`)}
      </div>

      {error && <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-600 font-bold">Error: {error}</div>}

      {/* ─── VISTA GENERAL ─────────────────────────────────────────────────── */}
      {!error && device && activeTab === 'general' && (
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
                <Row label="Ubicación" value={device.location ?? '—'} />
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
              <CountersCard />
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

          {/* Tendencia + estado */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 cd-panel p-6 bg-white border border-slate-100 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-extrabold text-[#1a2333] text-base flex items-center gap-2"><TrendingUp size={18} className="text-brand" />Tendencia de impresión</h3>
                <span className="text-[10px] font-extrabold px-3 py-1 bg-slate-100 text-slate-500 rounded-full uppercase tracking-widest">Últimas {Math.min(readings.length, 48)} lecturas</span>
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
                <div className="p-3 bg-sky-50 text-sky-600 rounded-xl"><Clock size={20} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ritmo de impresión</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">{rate.totalPerDay != null ? `${fmtInt(rate.totalPerDay)} págs/día` : 'Sin historial suficiente'}</p>
                  {rate.spanDays != null && <p className="text-[10px] text-slate-400 font-medium">{fmtInt(rate.spanDays)} días · {rate.samples} lecturas</p>}
                </div>
              </div>
            </div>
          </div>

          <SuppliesTable compact />
        </div>
      )}

      {/* ─── RECUENTOS ──────────────────────────────────────────────────────── */}
      {!error && device && activeTab === 'counters' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <CountersCard />
          <Card>
            <CardTitle icon={<Cpu size={16} />}>Desglose por función</CardTitle>
            {counters ? (
              <div>
                <TripleRows label="Impresión" t={counters.print} />
                <TripleRows label="Copia" t={counters.copy} />
                <TripleRows label="Fax" t={counters.fax} />
                <TripleRows label="Dúplex (equiv.)" t={counters.duplexEquivalent} />
                {counters.scans && (
                  <>
                    <Row label="Escaneos — copia" value={<span className="inline-flex items-center gap-1"><Copy size={11} />{fmtInt(counters.scans.copy)}</span>} />
                    <Row label="Escaneos — envío digital" value={<span className="inline-flex items-center gap-1"><ScanLine size={11} />{fmtInt(counters.scans.send)}</span>} />
                    <Row label="Escaneos — fax" value={<span className="inline-flex items-center gap-1"><Phone size={11} />{fmtInt(counters.scans.fax)}</span>} />
                    <Row label="Escaneos — total" value={fmtInt(counters.scans.total)} />
                  </>
                )}
                {counters.monoSimplex && <Row label="Mono símplex (print/report/total)" value={`${fmtInt(counters.monoSimplex.print)} / ${fmtInt(counters.monoSimplex.report)} / ${fmtInt(counters.monoSimplex.total)}`} />}
                {counters.duplex && <Row label="Dúplex (print/report/total)" value={`${fmtInt(counters.duplex.print)} / ${fmtInt(counters.duplex.report)} / ${fmtInt(counters.duplex.total)}`} />}
                {counters.colorEngineCycles != null && <Row label="Ciclos del motor en color" value={fmtInt(counters.colorEngineCycles)} />}
              </div>
            ) : (
              <p className="px-4 py-4 text-[11px] font-semibold text-slate-500">El equipo no expone desglose de contadores por función (sólo total/mono/color).</p>
            )}
          </Card>
        </div>
      )}

      {/* ─── CONSUMIBLES ────────────────────────────────────────────────────── */}
      {!error && device && activeTab === 'supplies' && <SuppliesTable />}

      {/* ─── MEDIOS ─────────────────────────────────────────────────────────── */}
      {!error && device && activeTab === 'media' && (
        <Card>
          <CardTitle icon={<Inbox size={16} />}>Bandejas de medios</CardTitle>
          {(details?.inputTrays?.length || details?.outputTrays?.length) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Bandeja</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Tamaño de papel</th><th className="px-3 py-2.5">Tipo de papel</th>
                    <th className="px-3 py-2.5 text-right">Capacidad</th><th className="px-3 py-2.5 min-w-[120px]">Nivel</th><th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
                  {(details?.inputTrays ?? []).map(t => (
                    <tr key={`in-${t.name}`} className="hover:bg-slate-50/90">
                      <td className="px-3 py-2 font-bold text-slate-800">{t.name}</td><td className="px-3 py-2">Entrada</td>
                      <td className="px-3 py-2">{t.paperSize ?? '—'}</td><td className="px-3 py-2">{t.paperType ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{t.capacity != null ? `${fmtInt(t.capacity)} hojas` : '—'}</td>
                      <td className="px-3 py-2">{t.level != null ? (
                        <div className="flex items-center gap-1.5"><div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${t.level <= 10 ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${Math.max(0, Math.min(100, t.level))}%` }} /></div><span className="font-extrabold w-8 text-right">{t.level}%</span></div>
                      ) : '—'}</td>
                      <td className="px-3 py-2">{t.status ?? '—'}</td>
                    </tr>
                  ))}
                  {(details?.outputTrays ?? []).map(t => (
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
      )}

      {/* ─── ALERTAS ────────────────────────────────────────────────────────── */}
      {!error && device && activeTab === 'alerts' && (
        <Card>
          <CardTitle icon={<AlertTriangle size={16} />}>Alertas activas del dispositivo</CardTitle>
          {activeAlerts.length ? (
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200"><tr><th className="px-3 py-2.5">Severidad</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Descripción</th><th className="px-3 py-2.5 text-right">Hora</th></tr></thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {activeAlerts.map(a => (
                  <tr key={a.key}>
                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${a.severity === 'ERROR' || a.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : a.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{a.severity}</span></td>
                    <td className="px-3 py-2 font-mono">{a.code ?? '—'}</td><td className="px-3 py-2 font-semibold text-slate-800">{a.message}</td><td className="px-3 py-2 text-right text-slate-500">{fmtDateTime(a.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-[11px] font-semibold text-slate-500 text-center">No hay alertas activas para este dispositivo.</p>
          )}
        </Card>
      )}

      <ConfirmationModal
        isOpen={deleteOpen}
        onClose={() => { if (!deleting) setDeleteOpen(false); }}
        onConfirm={handleDelete}
        title="Eliminar dispositivo"
        variant="destructive"
        confirmLabel="Eliminar"
        loading={deleting}
        error={deleteError}
      >
        Se eliminará <strong>{device?.model ?? 'el dispositivo'}</strong> ({device?.serial_number ?? device?.ip_address}) junto con todo su historial de lecturas y alertas. Esta acción no se puede deshacer.
      </ConfirmationModal>
    </div>
  );
};

export default DeviceDetail;
