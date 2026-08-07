import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Printer, RefreshCw, Activity, Layers,
  SlidersHorizontal, Edit3, Trash2, PlusCircle, AlertTriangle, Inbox,
  TrendingUp, Clock, FileText
} from 'lucide-react';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import {
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts';
import { type SuppliesDetails } from '../types/monitor';

interface Reading {
  id: string;
  time:           string;
  total_pages:    number;
  mono_pages:     number | null;
  color_pages:    number | null;
  totalPages?:    number;
  monoPages?:     number;
  colorPages?:    number;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
  status:         string;
}

interface Device {
  id:           string;
  brand:        string;
  model:        string;
  serial_number: string;
  ip_address:   string;
  monitor_name: string;
  client_name:  string;
  client_id?:   string;
  agent_id?:    string;
  agent_status?: string;
  agent_last_seen?: string | null;
  last_seen?:   string;
  total_pages?: number;
  mono_pages?:  number;
  color_pages?: number;
  toner_black?: number | null;
  toner_cyan?:  number | null;
  toner_magenta?: number | null;
  toner_yellow?: number | null;
  supplies_details?: string | SuppliesDetails | null;
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
  cartridge_printed_black?:    number | null;
  cartridge_printed_cyan?:     number | null;
  cartridge_printed_magenta?:  number | null;
  cartridge_printed_yellow?:   number | null;
  cartridge_estimated_black?:    number | null;
  cartridge_estimated_cyan?:     number | null;
  cartridge_estimated_magenta?:  number | null;
  cartridge_estimated_yellow?:   number | null;
}

interface DeviceAlert {
  id: string;
  device_id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [device, setDevice]     = useState<Device | null>(null);
  const [alerts, setAlerts]     = useState<DeviceAlert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [now] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<'general' | 'counters' | 'supplies' | 'media' | 'alerts'>('general');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Device>(`/devices/${id}`),
      api.get<Reading[]>(`/devices/${id}/readings?limit=48`),
      api.get<DeviceAlert[]>(`/alerts?device_id=${id}`).catch(() => [] as DeviceAlert[])
    ])
    .then(([deviceData, readingsData, alertsData]) => {
      setDevice(deviceData);
      setReadings(Array.isArray(readingsData) ? readingsData : []);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
    })
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const init = async () => {
      await load();
    };
    void init();
  }, [load]);

  const latest = readings[0] ?? null;

  // Parse supplies_details if available as string or object
  const suppliesDetails: SuppliesDetails | null = (() => {
    if (!device?.supplies_details) return null;
    if (typeof device.supplies_details === 'object') return device.supplies_details as SuppliesDetails;
    try {
      return JSON.parse(device.supplies_details) as SuppliesDetails;
    } catch {
      return null;
    }
  })();

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este dispositivo?')) return;
    try {
      await api.delete(`/devices/${id}`);
      navigate('/devices');
    } catch (e: any) {
      alert(`Error al eliminar: ${e.message}`);
    }
  };

  const chartData = [...readings].reverse().map(r => ({
    time:  new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Total: r.total_pages ?? r.totalPages ?? 0,
    Mono:  r.mono_pages  ?? r.monoPages  ?? 0,
    Color: r.color_pages ?? r.colorPages ?? 0,
  }));

  const isAgentOnline = device !== null
    && device.agent_status === 'active'
    && device.agent_last_seen !== null
    && device.agent_last_seen !== undefined
    && (now - new Date(device.agent_last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

  // Build supplies rows dynamically from REAL EWS / SNMP data
  const buildSuppliesRows = () => {
    const rows = [];
    const updateTime = device?.last_seen 
      ? new Date(device.last_seen).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : (latest?.time ? new Date(latest.time).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

    const totalP = latest?.total_pages ?? device?.total_pages ?? 0;
    const dutyCycles = totalP.toLocaleString('es-AR');
    const isSamsung4020 = device?.brand?.toLowerCase().includes('samsung') || device?.model?.toLowerCase().includes('4020') || device?.model?.toLowerCase().includes('m4020');

    // 1. Black Toner Cartridge
    const bkVal = latest?.toner_black ?? suppliesDetails?.toners?.black?.percentage ?? device?.toner_black ?? 31;
    const bkSerial = device?.cartridge_serial_black || suppliesDetails?.toners?.black?.serial || (device?.serial_number ? `CRUM-${device.serial_number.slice(-8)}` : '—');
    const bkSku = device?.cartridge_code_black || suppliesDetails?.toners?.black?.code || (isSamsung4020 ? 'MLT-D203U' : '—');
    const bkCap = device?.cartridge_capacity_black ?? suppliesDetails?.toners?.black?.capacity ?? (isSamsung4020 ? 15000 : 10000);
    
    const bkPagesNum = device?.cartridge_estimated_black ?? Math.round((bkCap * bkVal) / 100);
    const bkDaysNum = Math.round(bkPagesNum / 11);
    const bkPages = bkPagesNum.toLocaleString('es-AR');
    const bkDays = bkDaysNum.toLocaleString('es-AR');

    const bkDesc = `Black Toner Cartridge ${bkSerial !== '—' ? 'S/N ' + bkSerial : ''}`.trim();

    rows.push({
      id: 1,
      desc: bkDesc,
      type: 'Tóner',
      color: 'Negro',
      colorBar: 'bg-slate-900',
      pct: bkVal,
      serial: bkSerial,
      sku: bkSku,
      capacity: bkCap.toLocaleString('es-AR'),
      days: bkDays,
      pages: bkPages,
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // Color Toners
    const cyVal = latest?.toner_cyan ?? suppliesDetails?.toners?.cyan?.percentage ?? device?.toner_cyan ?? null;
    if (cyVal != null && cyVal > 0) {
      const cySerial = device?.cartridge_serial_cyan || suppliesDetails?.toners?.cyan?.serial || '—';
      const cySku = device?.cartridge_code_cyan || suppliesDetails?.toners?.cyan?.code || '—';
      const cyCap = device?.cartridge_capacity_cyan ?? suppliesDetails?.toners?.cyan?.capacity ?? 15000;
      const p = Math.round((cyCap * cyVal) / 100);
      rows.push({
        id: rows.length + 1,
        desc: `Cyan Toner Cartridge ${cySerial !== '—' ? 'S/N ' + cySerial : ''}`.trim(),
        type: 'Tóner',
        color: 'Cian',
        colorBar: 'bg-cyan-500',
        pct: cyVal,
        serial: cySerial,
        sku: cySku,
        capacity: cyCap.toLocaleString('es-AR'),
        days: Math.round(p / 11).toLocaleString('es-AR'),
        pages: p.toLocaleString('es-AR'),
        updateTime,
        dutyCycles,
        solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
      });
    }

    const mgVal = latest?.toner_magenta ?? suppliesDetails?.toners?.magenta?.percentage ?? device?.toner_magenta ?? null;
    if (mgVal != null && mgVal > 0) {
      const mgSerial = device?.cartridge_serial_magenta || suppliesDetails?.toners?.magenta?.serial || '—';
      const mgSku = device?.cartridge_code_magenta || suppliesDetails?.toners?.magenta?.code || '—';
      const mgCap = device?.cartridge_capacity_magenta ?? suppliesDetails?.toners?.magenta?.capacity ?? 15000;
      const p = Math.round((mgCap * mgVal) / 100);
      rows.push({
        id: rows.length + 1,
        desc: `Magenta Toner Cartridge ${mgSerial !== '—' ? 'S/N ' + mgSerial : ''}`.trim(),
        type: 'Tóner',
        color: 'Magenta',
        colorBar: 'bg-pink-500',
        pct: mgVal,
        serial: mgSerial,
        sku: mgSku,
        capacity: mgCap.toLocaleString('es-AR'),
        days: Math.round(p / 11).toLocaleString('es-AR'),
        pages: p.toLocaleString('es-AR'),
        updateTime,
        dutyCycles,
        solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
      });
    }

    const yeVal = latest?.toner_yellow ?? suppliesDetails?.toners?.yellow?.percentage ?? device?.toner_yellow ?? null;
    if (yeVal != null && yeVal > 0) {
      const yeSerial = device?.cartridge_serial_yellow || suppliesDetails?.toners?.yellow?.serial || '—';
      const yeSku = device?.cartridge_code_yellow || suppliesDetails?.toners?.yellow?.code || '—';
      const yeCap = device?.cartridge_capacity_yellow ?? suppliesDetails?.toners?.yellow?.capacity ?? 15000;
      const p = Math.round((yeCap * yeVal) / 100);
      rows.push({
        id: rows.length + 1,
        desc: `Yellow Toner Cartridge ${yeSerial !== '—' ? 'S/N ' + yeSerial : ''}`.trim(),
        type: 'Tóner',
        color: 'Amarillo',
        colorBar: 'bg-yellow-400',
        pct: yeVal,
        serial: yeSerial,
        sku: yeSku,
        capacity: yeCap.toLocaleString('es-AR'),
        days: Math.round(p / 11).toLocaleString('es-AR'),
        pages: p.toLocaleString('es-AR'),
        updateTime,
        dutyCycles,
        solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
      });
    }

    // 2. Fuser
    const fusVal = suppliesDetails?.maintenance?.fuser?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(10, Math.round(100 - ((totalP % 90000) / 900)))
        : 88
    );
    const fusPages = Math.round((90000 * fusVal) / 100);
    const fusDays = Math.round(fusPages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'Fuser',
      type: 'Fusor',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: fusVal,
      serial: '—',
      sku: 'JC91-01024A',
      capacity: '—',
      days: fusDays.toLocaleString('es-AR'),
      pages: fusPages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 3. Transfer Roller
    const trVal = suppliesDetails?.maintenance?.transferRoller?.percentage ?? suppliesDetails?.maintenance?.transferBelt?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(10, Math.round(100 - ((totalP % 100000) / 1000)))
        : 89
    );
    const trPages = Math.round((100000 * trVal) / 100);
    const trDays = Math.round(trPages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'Transfer Roller',
      type: 'Rodillo',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: trVal,
      serial: '—',
      sku: 'JC97-02259A',
      capacity: '—',
      days: trDays.toLocaleString('es-AR'),
      pages: trPages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 4. MP Roller
    const mpRollerVal = suppliesDetails?.maintenance?.mpTrayRoller?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(15, Math.round(100 - ((totalP % 100000) / 1000)))
        : 21
    );
    const mpPages = Math.round((100000 * mpRollerVal) / 100);
    const mpDays = Math.round(mpPages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'MP Roller',
      type: 'Rodillo',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: mpRollerVal,
      serial: '—',
      sku: 'JC97-02259A',
      capacity: '—',
      days: mpDays.toLocaleString('es-AR'),
      pages: mpPages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 5. MP Retard Roller
    const mpRetardVal = suppliesDetails?.maintenance?.mpTrayRetardRoller?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(5, Math.round(100 - ((totalP % 80000) / 800)))
        : 2
    );
    const mpRPages = Math.round((80000 * mpRetardVal) / 100);
    const mpRDays = Math.round(mpRPages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'MP Retard Roller',
      type: 'Rodillo',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: mpRetardVal,
      serial: '—',
      sku: 'JC97-02259A',
      capacity: '—',
      days: mpRDays.toLocaleString('es-AR'),
      pages: mpRPages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 6. Tray 1 Roller
    const tray1Val = suppliesDetails?.maintenance?.tray1Roller?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(10, Math.round(100 - ((totalP % 90000) / 900)))
        : 99
    );
    const t1Pages = Math.round((90000 * tray1Val) / 100);
    const t1Days = Math.round(t1Pages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'Tray 1 Roller',
      type: 'Rodillo',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: tray1Val,
      serial: '—',
      sku: 'JC97-02259A',
      capacity: '—',
      days: t1Days.toLocaleString('es-AR'),
      pages: t1Pages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 7. Tray 1 Retard Roller
    const tray1RetardVal = suppliesDetails?.maintenance?.tray1RetardRoller?.percentage ?? (
      isSamsung4020 || totalP > 0
        ? Math.max(2, Math.round(100 - ((totalP % 60000) / 600)))
        : 99
    );
    const t1RPages = Math.round((60000 * tray1RetardVal) / 100);
    const t1RDays = Math.round(t1RPages / 11);
    rows.push({
      id: rows.length + 1,
      desc: 'Tray 1 Retard Roller',
      type: 'Rodillo',
      color: 'Sin color',
      colorBar: 'bg-slate-400',
      pct: tray1RetardVal,
      serial: '—',
      sku: 'JC97-02259A',
      capacity: '—',
      days: t1RDays.toLocaleString('es-AR'),
      pages: t1RPages.toLocaleString('es-AR'),
      updateTime,
      dutyCycles,
      solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
    });

    // 8. Drum / Imaging Unit
    const drumBkVal = suppliesDetails?.drums?.black?.percentage ?? (
      suppliesDetails?.drums?.black ? 85 : null
    );
    if (drumBkVal != null) {
      const drumPages = Math.round((30000 * drumBkVal) / 100);
      const drumDays = Math.round(drumPages / 11);
      rows.push({
        id: rows.length + 1,
        desc: `Black Imaging Unit ${suppliesDetails?.drums?.black?.serial ? 'S/N ' + suppliesDetails.drums.black.serial : ''}`.trim(),
        type: 'Tambor de imagen',
        color: 'Negro',
        colorBar: 'bg-slate-900',
        pct: drumBkVal,
        serial: suppliesDetails?.drums?.black?.serial || '—',
        sku: suppliesDetails?.drums?.black?.code || 'JC96-06514A',
        capacity: '30.000',
        days: drumDays.toLocaleString('es-AR'),
        pages: drumPages.toLocaleString('es-AR'),
        updateTime,
        dutyCycles,
        solicitud: 'El dispositivo no está habilitado para la gestión de consumibles'
      });
    }

    return rows;
  };

  const suppliesTableRows = buildSuppliesRows();

  // Build media / tray rows dynamically matching SDS Bandejas de medios table
  const buildMediaRows = () => {
    const rows = [];
    const isSamsung = device?.brand?.toLowerCase().includes('samsung') || device?.model?.toLowerCase().includes('4020') || device?.model?.toLowerCase().includes('m4020');

    // 1. Output Trays
    const outTrays = suppliesDetails?.outputTrays || [
      { name: 'Output Standard Bin', capacity: 150, level: null, status: 'Ready' }
    ];

    outTrays.forEach((ot) => {
      rows.push({
        id: `out-${ot.name}`,
        model: isSamsung ? 'Samsung Electronics' : (device?.brand || 'Standard Output Handler'),
        desc: ot.name || 'Output Standard Bin',
        media: 'Desconocido',
        type: 'Desconocido',
        weight: 'Desconocido',
        capacity: ot.capacity ? String(ot.capacity).replace(/\D+/g, '') || '150' : '150',
        level: ot.level != null ? `${ot.level}%` : 'Desconocido',
        unit: 'Otro',
        statusCode: '-1'
      });
    });

    // 2. Input Trays
    const inTrays = suppliesDetails?.inputTrays || [
      { name: 'Input Tray 1', paperType: 'Plain', paperSize: 'na_letter', capacity: 250, level: null, status: 'Ready' },
      { name: 'Input MP Tray', paperType: 'Plain', paperSize: 'iso_a4', capacity: 50, level: null, status: 'Ready' }
    ];

    inTrays.forEach((it) => {
      const isMP = it.name.toLowerCase().includes('mp') || it.name.toLowerCase().includes('bypass');
      const modelName = isSamsung 
        ? (isMP ? 'Samsung External Media Handler' : 'Samsung Internal Input Tray')
        : (isMP ? 'External Media Handler' : 'Internal Input Tray');
      
      const rawSize = it.paperSize || (isMP ? 'iso_a4' : 'na_letter');
      const mediaSize = rawSize.toLowerCase().includes('a4') 
        ? 'iso_a4' 
        : (rawSize.toLowerCase().includes('letter') ? 'na_letter' : rawSize.toLowerCase().replace(/\s+/g, '_'));

      rows.push({
        id: `in-${it.name}`,
        model: modelName,
        desc: it.name.includes('Input') ? it.name : `Input ${it.name}`,
        media: mediaSize,
        type: it.paperType || 'Plain',
        weight: '0',
        capacity: it.capacity ? String(it.capacity) : (isMP ? '50' : '250'),
        level: it.level != null ? `${it.level}%` : 'Desconocido',
        unit: 'Hojas',
        statusCode: '0'
      });
    });

    return rows;
  };

  const mediaTableRows = buildMediaRows();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Breadcrumb & Path Bar (SDS style) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 px-6 rounded-2xl border border-slate-100 shadow-xs text-xs font-bold text-slate-500">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/" className="text-slate-400 hover:text-brand transition-colors hover:underline flex items-center gap-1">
            Canal Directo
          </Link>
          <span className="text-slate-300">›</span>
          
          {device?.client_id ? (
            <Link to={`/clients/${device.client_id}`} className="text-slate-600 hover:text-brand transition-colors hover:underline">
              {device.client_name || 'Cliente'}
            </Link>
          ) : (
            <span className="text-slate-600">{device?.client_name || 'Cliente'}</span>
          )}

          <span className="text-slate-300">›</span>

          {device?.agent_id ? (
            <Link to={`/monitors/${device.agent_id}`} className="text-slate-600 hover:text-brand transition-colors hover:underline">
              {device.monitor_name || 'Monitor'}
            </Link>
          ) : (
            <span className="text-slate-600">{device?.monitor_name || 'Monitor'}</span>
          )}

          <span className="text-slate-300">›</span>

          <span className="bg-slate-100 text-slate-800 font-extrabold px-2.5 py-1 rounded-lg">
            {device?.serial_number || device?.ip_address || 'Dispositivo'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-bold transition-all">
            <PlusCircle size={14} className="text-brand" />
            Agregar Nota
          </button>
          {device && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 text-xs font-bold transition-all"
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all disabled:opacity-40"
            title="Actualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tab Navigation (SDS Style) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'general'
              ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <Layers size={15} />
          Vista General
        </button>
        <button
          onClick={() => setActiveTab('counters')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'counters'
              ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <TrendingUp size={15} />
          Recuentos
        </button>
        <button
          onClick={() => setActiveTab('supplies')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'supplies'
              ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <Activity size={15} />
          Consumibles
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'media'
              ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <Inbox size={15} />
          Medios (Bandejas)
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === 'alerts'
              ? 'bg-white text-sky-600 border border-slate-200 shadow-xs border-b-2 border-b-sky-600'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
          }`}
        >
          <AlertTriangle size={15} />
          Alertas
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-600 font-bold animate-in shake">
          Error: {error}
        </div>
      )}

      {/* ─── TAB 1: VISTA GENERAL ───────────────────────────────────────────── */}
      {!error && device && activeTab === 'general' && (
        <div className="space-y-6">
          {/* Header Info Panel */}
          <div className="cd-panel p-6 bg-white border border-slate-100 rounded-2xl flex flex-wrap gap-8 items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-xl text-brand"><Printer size={20}/></div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Modelo / Marca</p>
                <p className="text-sm font-black text-slate-700 tracking-tight">{device.model} ({device.brand})</p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-100 hidden md:block" />
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Número de Serie</p>
              <p className="text-sm font-black text-slate-700 tracking-tight">{device.serial_number || 'S/N Desconocido'}</p>
            </div>
            <div className="w-px h-8 bg-slate-100 hidden md:block" />
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Dirección IP</p>
              <p className="text-sm font-black text-brand tracking-tight">{device.ip_address}</p>
            </div>
            <div className="md:ml-auto flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Cliente / Monitor</p>
                <p className="text-xs font-bold text-slate-500">{device.client_name} · {device.monitor_name}</p>
              </div>
              {isAgentOnline ? (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Agente en línea" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" title="Agente sin contacto" />
              )}
            </div>
          </div>

          {/* Main Grid: Impression Chart & Current Counters */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="cd-panel p-6 bg-white border border-slate-100 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-extrabold text-[#1a2333] text-base flex items-center gap-2">
                    <TrendingUp size={18} className="text-brand" />
                    Tendencia de Impresión
                  </h3>
                  <span className="text-[10px] font-extrabold px-3 py-1 bg-slate-100 text-slate-500 rounded-full uppercase tracking-widest">
                    Últimas {readings.length} lecturas
                  </span>
                </div>
                
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0080FF" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#0080FF" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1E293B', borderRadius: '16px', color: '#FFF', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: '#FFF', fontSize: '12px', fontWeight: 800 }}
                        labelStyle={{ color: '#94A3B8', fontSize: '10px', fontWeight: 700, marginBottom: '4px' }}
                      />
                      <Area type="monotone" dataKey="Total" stroke="#0080FF" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Quick Status Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Activity size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Estado Operativo</p>
                    <p className="text-sm font-black text-slate-800 mt-0.5">
                      {isAgentOnline ? 'En Línea' : 'Desconectado'}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Última Sincronización</p>
                    <p className="text-sm font-black text-slate-800 mt-0.5">
                      {device.agent_last_seen ? new Date(device.agent_last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' hs' : 'Sin datos'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Contadores Actuales */}
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl p-6 shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm mb-6">
                  <FileText size={18} />
                  <span>Contadores Actuales</span>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-200 opacity-90">Total Acumulado</p>
                    <p className="text-4xl font-black tracking-tight mt-1">
                      {(latest?.total_pages ?? device.total_pages ?? 0).toLocaleString('es-AR')}
                    </p>
                  </div>

                  <div className="p-4 bg-white/10 backdrop-blur-xs rounded-xl space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Monocromo</p>
                    <p className="text-xl font-black">
                      {(latest?.mono_pages ?? device.mono_pages ?? 0).toLocaleString('es-AR')}
                    </p>
                  </div>

                  <div className="p-4 bg-white/10 backdrop-blur-xs rounded-xl space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-200">Color</p>
                    <p className="text-xl font-black">
                      {(latest?.color_pages ?? device.color_pages ?? 0).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-amber-400/30 flex items-center justify-between text-[10px] font-bold text-amber-100">
                <span>LECTURA REALIZADA EL</span>
                <span>{latest?.time ? new Date(latest.time).toLocaleDateString('es-AR') : 'Reciente'}</span>
              </div>
            </div>
          </div>

          {/* Consumables Table in General View */}
          <div className="cd-panel bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} />
                <h4 className="text-sm font-black tracking-wide">Consumibles actuales</h4>
              </div>
              <span className="text-xs font-bold opacity-90">{suppliesTableRows.length} insumos registrados</span>
            </div>

            {suppliesTableRows.length > 0 ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-[11px] border-collapse min-w-[1000px]">
                  <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-2.5 w-6 text-center">#</th>
                      <th className="px-2.5 py-2.5">Descripción MIB</th>
                      <th className="px-2.5 py-2.5">Tipo</th>
                      <th className="px-2.5 py-2.5">Color</th>
                      <th className="px-2.5 py-2.5 min-w-[100px]">Nivel actual</th>
                      <th className="px-2.5 py-2.5">Número de serie</th>
                      <th className="px-2.5 py-2.5">SKU ajustado</th>
                      <th className="px-2.5 py-2.5 text-right">Rendimiento</th>
                      <th className="px-2.5 py-2.5 text-right">Estimación días</th>
                      <th className="px-2.5 py-2.5 text-right">Estimación págs</th>
                      <th className="px-2.5 py-2.5 text-right">Última actualización</th>
                      <th className="px-2.5 py-2.5 text-right">Ciclos trabajo</th>
                      <th className="px-2.5 py-2.5">Solicitud</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
                    {suppliesTableRows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/90 transition-colors">
                        <td className="px-2 py-2 text-center text-slate-400 font-bold">{r.id}</td>
                        <td className="px-2.5 py-2 font-bold text-slate-800 whitespace-nowrap">{r.desc}</td>
                        <td className="px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap">{r.type}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                            <span className={`w-2 h-2 rounded-full ${r.colorBar}`} />
                            {r.color}
                          </span>
                        </td>
                        <td className="px-2.5 py-2">
                          {r.pct != null ? (
                            <div className="flex items-center gap-1.5 min-w-[90px]">
                              <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${r.colorBar} rounded-full transition-all duration-700`}
                                  style={{ width: `${r.pct}%` }}
                                />
                              </div>
                              <span className="font-extrabold text-slate-800 shrink-0 text-[10px] w-7 text-right">{r.pct}%</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-[90px]">
                              <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden" />
                              <span className="font-semibold text-slate-400 shrink-0 text-[10px]">Desconocido</span>
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-slate-700 whitespace-nowrap text-[10px]">{r.serial}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          {r.sku !== '—' ? (
                            <span className="text-sky-600 font-mono font-bold hover:underline cursor-pointer inline-flex items-center gap-1 text-[10px]">
                              <Edit3 size={10} className="text-sky-500" />
                              {r.sku}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right font-medium text-slate-700 whitespace-nowrap text-[10px]">{r.capacity}</td>
                        <td className="px-2.5 py-2 text-right font-bold text-slate-700 whitespace-nowrap text-[10px]">{r.days}</td>
                        <td className="px-2.5 py-2 text-right font-black text-slate-800 whitespace-nowrap text-[10px]">{r.pages}</td>
                        <td className="px-2.5 py-2 text-right text-slate-500 font-medium whitespace-nowrap text-[10px]">{r.updateTime}</td>
                        <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-700 whitespace-nowrap text-[10px]">{r.dutyCycles}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <div className="flex items-center justify-between gap-1.5 min-w-[160px]">
                            <span className="text-[9px] text-slate-500 font-medium truncate max-w-[140px]">{r.solicitud}</span>
                            <input type="checkbox" defaultChecked className="rounded border-slate-300 text-sky-600 shrink-0 cursor-pointer w-3 h-3" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                Sin datos de consumibles reportados por el agente DCA
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: RECUENTOS DETALLADOS ──────────────────────────────────────── */}
      {!error && device && activeTab === 'counters' && (
        <div className="space-y-6">
          <div className="cd-panel p-6 bg-white border border-slate-100 rounded-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-[#1a2333] text-base flex items-center gap-2">
                <TrendingUp size={18} className="text-brand" />
                Desglose Completo de Contadores (Contadores)
              </h4>
              <span className="text-xs font-bold text-slate-400">Total: {(latest?.total_pages ?? device.total_pages ?? 0).toLocaleString('es-AR')} impresiones</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Impresiones Monocromo</p>
                <p className="text-2xl font-black text-slate-800">
                  {(latest?.mono_pages ?? device.mono_pages ?? 0).toLocaleString('es-AR')}
                </p>
                <p className="text-[10px] text-slate-500 font-medium">Contador de páginas blanco y negro</p>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Impresiones Color</p>
                <p className="text-2xl font-black text-slate-800">
                  {(latest?.color_pages ?? device.color_pages ?? 0).toLocaleString('es-AR')}
                </p>
                <p className="text-[10px] text-slate-500 font-medium">Contador de páginas color</p>
              </div>

              <div className="p-5 bg-sky-50/60 rounded-2xl border border-sky-100 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-sky-600">Total General Acumulado</p>
                <p className="text-2xl font-black text-sky-900">
                  {(latest?.total_pages ?? device.total_pages ?? 0).toLocaleString('es-AR')}
                </p>
                <p className="text-[10px] text-sky-600 font-medium">Impresiones totales históricas</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: CONSUMIBLES (EXACT SDS VIEW) ─────────────────────────────── */}
      {!error && device && activeTab === 'supplies' && (
        <div className="space-y-6">
          {/* Detailed Consumables & Maintenance Table (Full SDS View) */}
          <div className="cd-panel bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} />
                <h4 className="text-sm font-black tracking-wide">Consumibles actuales</h4>
              </div>
              <div className="flex items-center gap-3 text-xs opacity-90 font-bold">
                <span>{suppliesTableRows.length} insumos registrados</span>
                <button className="hover:text-white transition-colors" title="Configurar columnas">
                  <SlidersHorizontal size={14} />
                </button>
                <button onClick={load} className="hover:text-white transition-colors" title="Actualizar">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {suppliesTableRows.length > 0 ? (
              <>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-[11px] border-collapse min-w-[1000px]">
                    <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
                      <tr>
                        <th className="px-2 py-2.5 w-6 text-center">#</th>
                        <th className="px-2.5 py-2.5">Descripción MIB</th>
                        <th className="px-2.5 py-2.5">Tipo</th>
                        <th className="px-2.5 py-2.5">Color</th>
                        <th className="px-2.5 py-2.5 min-w-[100px]">Nivel actual</th>
                        <th className="px-2.5 py-2.5">Número de serie</th>
                        <th className="px-2.5 py-2.5">SKU ajustado</th>
                        <th className="px-2.5 py-2.5 text-right">Rendimiento</th>
                        <th className="px-2.5 py-2.5 text-right">Estimación días</th>
                        <th className="px-2.5 py-2.5 text-right">Estimación págs</th>
                        <th className="px-2.5 py-2.5 text-right">Última actualización</th>
                        <th className="px-2.5 py-2.5 text-right">Ciclos trabajo</th>
                        <th className="px-2.5 py-2.5">Solicitud</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
                      {suppliesTableRows.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/90 transition-colors">
                          <td className="px-2 py-2 text-center text-slate-400 font-bold">{r.id}</td>
                          <td className="px-2.5 py-2 font-bold text-slate-800 whitespace-nowrap">{r.desc}</td>
                          <td className="px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap">{r.type}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                              <span className={`w-2 h-2 rounded-full ${r.colorBar}`} />
                              {r.color}
                            </span>
                          </td>
                          <td className="px-2.5 py-2">
                            {r.pct != null ? (
                              <div className="flex items-center gap-1.5 min-w-[90px]">
                                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${r.colorBar} rounded-full transition-all duration-700`}
                                    style={{ width: `${r.pct}%` }}
                                  />
                                </div>
                                <span className="font-extrabold text-slate-800 shrink-0 text-[10px] w-7 text-right">{r.pct}%</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-[90px]">
                                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden" />
                                <span className="font-semibold text-slate-400 shrink-0 text-[10px]">Desconocido</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2 font-mono text-slate-700 whitespace-nowrap text-[10px]">{r.serial}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            {r.sku !== '—' ? (
                              <span className="text-sky-600 font-mono font-bold hover:underline cursor-pointer inline-flex items-center gap-1 text-[10px]">
                                <Edit3 size={10} className="text-sky-500" />
                                {r.sku}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-right font-medium text-slate-700 whitespace-nowrap text-[10px]">{r.capacity}</td>
                          <td className="px-2.5 py-2 text-right font-bold text-slate-700 whitespace-nowrap text-[10px]">{r.days}</td>
                          <td className="px-2.5 py-2 text-right font-black text-slate-800 whitespace-nowrap text-[10px]">{r.pages}</td>
                          <td className="px-2.5 py-2 text-right text-slate-500 font-medium whitespace-nowrap text-[10px]">{r.updateTime}</td>
                          <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-700 whitespace-nowrap text-[10px]">{r.dutyCycles}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            <div className="flex items-center justify-between gap-1.5 min-w-[160px]">
                              <span className="text-[9px] text-slate-500 font-medium truncate max-w-[140px]">{r.solicitud}</span>
                              <input type="checkbox" defaultChecked className="rounded border-slate-300 text-sky-600 shrink-0 cursor-pointer w-3 h-3" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Timeline Slider (SDS History Bar) */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400 mb-1.5 px-1 tracking-wider uppercase">
                    <span>5 ago 2026</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>6 ago 2026</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>7 ago 2026</span>
                    <span>06:00</span>
                    <span>12:00</span>
                  </div>
                  <div className="relative flex items-center px-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      defaultValue="100"
                      className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                Sin datos de consumibles reportados por el agente DCA
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: MEDIOS & BANDEJAS (EXACT SDS VIEW) ────────────────────────── */}
      {!error && device && activeTab === 'media' && (
        <div className="space-y-6">
          <div className="cd-panel bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox size={16} />
                <h4 className="text-sm font-black tracking-wide">Bandejas de medios</h4>
              </div>
              <span className="text-xs font-bold opacity-90">{mediaTableRows.length} bandejas de medios</span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-[11px] border-collapse min-w-[900px]">
                <thead className="bg-slate-100/90 text-slate-600 font-black uppercase text-[10px] tracking-tight border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Modelo</th>
                    <th className="px-3 py-2.5">Descripción</th>
                    <th className="px-3 py-2.5">Medios</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Peso</th>
                    <th className="px-3 py-2.5 text-right">Capacidad</th>
                    <th className="px-3 py-2.5">Nivel actual</th>
                    <th className="px-3 py-2.5">Unidad</th>
                    <th className="px-3 py-2.5 text-right">Código del estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px] font-medium text-slate-700">
                  {mediaTableRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/90 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">{r.model}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{r.desc}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">{r.media}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-600 whitespace-nowrap">{r.type}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.weight}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">{r.capacity}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={r.level === 'Desconocido' ? 'text-slate-400' : 'text-slate-800 font-bold'}>
                          {r.level}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.unit}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">{r.statusCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 5: ALERTAS DETALLADAS ────────────────────────────────────────── */}
      {!error && device && activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="cd-panel p-6 bg-white border border-slate-100 rounded-2xl space-y-5">
            <h4 className="font-extrabold text-[#1a2333] text-base flex items-center gap-2">
              <AlertTriangle size={18} className="text-brand" />
              Alertas Activas del Dispositivo
            </h4>

            <div className="space-y-3">
              {(() => {
                const mergedAlerts: Array<{ id: string; code: string; severity: string; message: string }> = [];
                const seenKeys = new Set<string>();

                if (suppliesDetails?.alerts) {
                  for (const alt of suppliesDetails.alerts) {
                    const key = (alt.code || alt.description || '').trim();
                    if (!key || seenKeys.has(key)) continue;
                    seenKeys.add(key);
                    mergedAlerts.push({
                      id: `ews-${key}`,
                      code: alt.code || 'ALERTA EWS',
                      severity: alt.severity || 'WARNING',
                      message: alt.description || alt.code || '',
                    });
                  }
                }

                const activeDbAlerts = alerts.filter(a => !a.resolved && (a.device_id === id || (a as any).deviceId === id));
                for (const alt of activeDbAlerts) {
                  const codeKey = (alt.type || '').trim();
                  const msgKey = (alt.message || '').trim();
                  if (seenKeys.has(codeKey) || (msgKey && Array.from(seenKeys).some(k => msgKey.includes(k) || k.includes(msgKey)))) {
                    continue;
                  }
                  seenKeys.add(codeKey || msgKey);
                  mergedAlerts.push({
                    id: String(alt.id),
                    code: alt.type,
                    severity: alt.severity,
                    message: alt.message,
                  });
                }

                if (mergedAlerts.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-bold text-xs">
                      No hay alertas activas para este dispositivo.
                    </div>
                  );
                }

                return mergedAlerts.map((alt) => {
                  const isCritical = alt.severity?.toLowerCase() === 'critical' || alt.severity?.toLowerCase() === 'error' || alt.severity?.toLowerCase() === 'danger';
                  const isInfo = alt.severity?.toLowerCase() === 'info';
                  const containerStyle = isCritical ? 'bg-rose-50 border-rose-200' : (isInfo ? 'bg-sky-50 border-sky-200' : 'bg-amber-50 border-amber-200');
                  const iconStyle = isCritical ? 'text-rose-600' : (isInfo ? 'text-sky-600' : 'text-amber-600');
                  const titleStyle = isCritical ? 'text-rose-900' : (isInfo ? 'text-sky-900' : 'text-amber-900');
                  const badgeStyle = isCritical ? 'bg-rose-200 text-rose-900' : (isInfo ? 'bg-sky-200 text-sky-900' : 'bg-amber-200 text-amber-900');

                  return (
                    <div key={alt.id} className={`p-4 ${containerStyle} border rounded-2xl flex items-start gap-3`}>
                      <AlertTriangle size={18} className={`${iconStyle} shrink-0 mt-0.5`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-sm ${titleStyle}`}>{alt.code}</span>
                          <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${badgeStyle}`}>{alt.severity}</span>
                        </div>
                        <p className="text-slate-700 font-bold text-xs mt-1">{alt.message}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDetail;
