import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { 
  FileText, Download, Search, Calendar, User, 
  Palette, Layers, TrendingUp, Sparkles, AlertCircle,
  Filter, Printer
} from 'lucide-react';
import { REPORT_RECORD_LIMIT } from '../lib/constants';

interface Client  { id: string; name: string }
interface Device  { id: string; name: string; ip_address: string; brand: string; serial_number?: string }
interface Reading {
  time:        string;
  total_pages: number;
  mono_pages:  number | null;
  color_pages: number | null;
  status:      string;
  offline?:    boolean;
}

interface ConsolidatedDeviceData {
  device: Device;
  initialTotal: number;
  finalTotal: number;
  printedTotal: number;
  printedMono: number;
  printedColor: number;
  status: string;
}

const today    = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

function toConsolidatedCSV(rows: ConsolidatedDeviceData[], clientName: string, from: string, to: string): string {
  const header = 'SERIE;DISPOSITIVO;IP;MARCA;CONTADOR INICIAL;CONTADOR FINAL;TOTAL IMPRESO;MONOCROMO;COLOR;ESTADO';
  const lines = rows.map(r =>
    [
      r.device.serial_number || 'S/N',
      r.device.name || 'Sin Nombre',
      r.device.ip_address,
      r.device.brand?.toUpperCase(),
      r.initialTotal,
      r.finalTotal,
      r.printedTotal,
      r.printedMono,
      r.printedColor,
      r.status.toUpperCase()
    ].join(';')
  );
  return `# Reporte Consolidado Ejecutivo: ${clientName} (${from} a ${to})\n${header}\n${lines.join('\n')}`;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const Reports = () => {
  const [clients, setClients]   = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [from, setFrom]         = useState(monthAgo);
  const [to, setTo]             = useState(today);
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedDeviceData[] | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<Client[]>('/clients')
      .then(data => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const generate = async () => {
    if (!clientId) return;
    setLoading(true); 
    setError(''); 
    setConsolidatedData(null);

    try {
      // Get all active devices of the selected client
      const devices = await api.get<Device[]>(`/clients/${clientId}/devices`);
      const clientDevices = Array.isArray(devices) ? devices : [];

      if (clientDevices.length === 0) {
        setConsolidatedData([]);
        return;
      }

      // Fetch readings for all devices in parallel
      const promises = clientDevices.map(async (d) => {
        try {
          const rd = await api.get<Reading[]>(
            `/devices/${d.id}/readings?from=${from}T00:00:00Z&to=${to}T23:59:59Z&limit=${REPORT_RECORD_LIMIT}`
          );
          return { device: d, readings: Array.isArray(rd) ? rd : [] };
        } catch {
          return { device: d, readings: [] };
        }
      });

      const results = await Promise.all(promises);
      
      const list = results.map(({ device, readings }) => {
        if (readings.length === 0) {
          return {
            device,
            initialTotal: 0,
            finalTotal: 0,
            printedTotal: 0,
            printedMono: 0,
            printedColor: 0,
            status: 'sin lecturas',
          };
        }
        const finalR = readings[0];
        const initialR = readings[readings.length - 1];
        const printedTotal = Math.max(0, finalR.total_pages - initialR.total_pages);
        const printedMono = Math.max(0, (finalR.mono_pages ?? 0) - (initialR.mono_pages ?? 0));
        const printedColor = Math.max(0, (finalR.color_pages ?? 0) - (initialR.color_pages ?? 0));
        const isOffline = finalR.offline || finalR.status === 'offline';
        return {
          device,
          initialTotal: initialR.total_pages,
          finalTotal: finalR.total_pages,
          printedTotal,
          printedMono,
          printedColor,
          status: isOffline ? 'offline' : (finalR.status || 'ok'),
        };
      });

      setConsolidatedData(list);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!consolidatedData) return;
    const client = clients.find(c => c.id === clientId);
    const clientName = client ? client.name : 'STC';
    downloadCSV(toConsolidatedCSV(consolidatedData, clientName, from, to), `reporte_consolidado_${clientName}_${from}_${to}.csv`);
  };

  // Calculate Data Storytelling Executive Metrics
  const getExecutiveMetrics = () => {
    if (!consolidatedData) return null;

    let totalPrinted = 0;
    let totalMono = 0;
    let totalColor = 0;
    let topDevice: ConsolidatedDeviceData | null = null;
    let onlineCount = 0;
    const totalDevices = consolidatedData.length;

    consolidatedData.forEach(item => {
      totalPrinted += item.printedTotal;
      totalMono += item.printedMono;
      totalColor += item.printedColor;
      if (item.status === 'online' || item.status === 'ok') onlineCount++;

      if (!topDevice || item.printedTotal > topDevice.printedTotal) {
        topDevice = item;
      }
    });

    const monoPct = totalPrinted > 0 ? Math.round((totalMono / totalPrinted) * 100) : 0;
    const colorPct = totalPrinted > 0 ? Math.round((totalColor / totalPrinted) * 100) : 0;

    return {
      totalPrinted,
      totalMono,
      totalColor,
      monoPct,
      colorPct,
      topDevice,
      onlineCount,
      totalDevices
    };
  };

  const execMetrics = getExecutiveMetrics();
  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-black text-[#1a2333] tracking-tight">Reportes de Contadores</h1>
        <p className="text-slate-400 mt-1 font-bold uppercase tracking-widest text-[10px]">Análisis consolidado y auditoría de lecturas a nivel cliente</p>
      </header>

      {/* Filters */}
      <div className="cd-panel p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 text-brand rounded-xl">
            <Filter size={20} />
          </div>
          <h3 className="text-lg font-extrabold text-[#1a2333]">Parámetros de Búsqueda</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
            <div className="relative">
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={clientId} 
                onChange={e => {
                  setClientId(e.target.value);
                  setConsolidatedData(null);
                }} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
              >
                <option value="">Seleccionar cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicial</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="date" 
                value={from} 
                onChange={e => {
                  setFrom(e.target.value);
                  setConsolidatedData(null);
                }} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Final</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="date" 
                value={to} 
                onChange={e => {
                  setTo(e.target.value);
                  setConsolidatedData(null);
                }} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand" 
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8 pt-6 border-t border-slate-100">
          <button
            onClick={generate}
            disabled={!clientId || loading}
            className="sm:w-64 flex items-center justify-center gap-2 bg-brand hover:bg-[#2471a3] disabled:opacity-40 text-white px-8 py-4 rounded-2xl text-sm font-extrabold shadow-lg shadow-blue-900/10 transition-all active:scale-95"
          >
            <Search size={18} />
            {loading ? 'Generando...' : 'Generar Reporte Ejecutivo'}
          </button>
          
          {consolidatedData && consolidatedData.length > 0 && (
            <button
              onClick={exportCSV}
              className="sm:w-64 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl text-sm font-extrabold shadow-lg shadow-emerald-900/10 transition-all active:scale-95 animate-in zoom-in-95"
            >
              <Download size={18} />
              Exportar CSV ({consolidatedData.length} equipos)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-6 text-rose-600 text-sm font-bold animate-in shake flex items-center gap-3">
          <AlertCircle size={18} />
          Error: {error}
        </div>
      )}

      {/* EXECUTIVE VIEW */}
      {execMetrics && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* Headline Story Box */}
          <div className="bg-gradient-to-r from-brand/5 via-blue-50/50 to-emerald-50/10 border border-brand/10 rounded-[32px] p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-brand text-white rounded-2xl shadow-md mt-1 animate-pulse">
                <Sparkles size={24} />
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-black text-brand uppercase tracking-widest bg-brand/10 px-3 py-1 rounded-full">Resumen Ejecutivo de Actividad</span>
                <h2 className="text-xl md:text-2xl font-black text-[#1a2333] leading-snug">
                  El volumen consolidado para <span className="text-brand font-black">{selectedClient?.name}</span> fue de <span className="text-brand font-black">{execMetrics.totalPrinted.toLocaleString()}</span> páginas entre el {new Date(from + 'T00:00:00').toLocaleDateString()} y el {new Date(to + 'T00:00:00').toLocaleDateString()}.
                </h2>
                <p className="text-slate-500 font-bold text-xs leading-relaxed uppercase tracking-wider">
                  Un <span className="text-[#1a2333]">{execMetrics.monoPct}%</span> de la actividad fue en monocromo y un <span className="text-emerald-600">{execMetrics.colorPct}%</span> a color. 
                  {execMetrics.topDevice && execMetrics.topDevice.printedTotal > 0 && (
                    <> El equipo más activo fue <span className="text-brand">{execMetrics.topDevice.device.name || execMetrics.topDevice.device.ip_address}</span> ({execMetrics.topDevice.device.brand?.toUpperCase()}) registrando <span className="text-[#1a2333]">{execMetrics.topDevice.printedTotal.toLocaleString()}</span> impresiones.</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="cd-panel p-6 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Volumen Total</span>
                <span className="text-2xl font-black text-[#1a2333] block">{execMetrics.totalPrinted.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-blue-50 text-brand rounded-2xl">
                <TrendingUp size={22} />
              </div>
            </div>

            <div className="cd-panel p-6 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Páginas Mono</span>
                <span className="text-2xl font-black text-[#1a2333] block">{execMetrics.totalMono.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl">
                <Printer size={22} />
              </div>
            </div>

            <div className="cd-panel p-6 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Páginas Color</span>
                <span className="text-2xl font-black text-emerald-600 block">{execMetrics.totalColor.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Palette size={22} />
              </div>
            </div>

            <div className="cd-panel p-6 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Dispositivos</span>
                <span className="text-2xl font-black text-[#1a2333] block">{execMetrics.onlineCount} / {execMetrics.totalDevices}</span>
              </div>
              <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl">
                <Layers size={22} />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="cd-panel overflow-hidden">
            <header className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <h3 className="font-extrabold text-[#1a2333] flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl shadow-sm text-brand">
                  <FileText size={18} />
                </div>
                Consolidado por Dispositivo
              </h3>
            </header>

            {consolidatedData.length === 0 ? (
              <div className="text-center py-20 bg-white">
                <FileText size={48} className="mx-auto mb-4 text-slate-100" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Este cliente no posee dispositivos registrados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>SERIE</th>
                      <th>Dispositivo</th>
                      <th>IP</th>
                      <th>Marca</th>
                      <th className="text-right">Inicial</th>
                      <th className="text-right">Final</th>
                      <th className="text-right">Impreso</th>
                      <th className="text-right">Monocromo</th>
                      <th className="text-right">Color</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedData.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="font-medium text-slate-500 whitespace-nowrap text-xs">
                          {r.device.serial_number || 'S/N'}
                        </td>
                        <td className="font-extrabold text-[#1a2333]">
                          {r.device.name || 'Sin Nombre'}
                        </td>
                        <td className="font-semibold text-slate-500 text-xs">
                          {r.device.ip_address}
                        </td>
                        <td className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                          {r.device.brand?.toUpperCase()}
                        </td>
                        <td className="text-right text-slate-400 font-semibold">
                          {r.initialTotal.toLocaleString()}
                        </td>
                        <td className="text-right text-slate-400 font-semibold">
                          {r.finalTotal.toLocaleString()}
                        </td>
                        <td className="text-right font-black text-brand">
                          {r.printedTotal.toLocaleString()}
                        </td>
                        <td className="text-right text-slate-500 font-bold">
                          {r.printedMono.toLocaleString()}
                        </td>
                        <td className="text-right text-emerald-600 font-bold">
                          {r.printedColor.toLocaleString()}
                        </td>
                        <td>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            (r.status === 'online' || r.status === 'ok') ? 'bg-emerald-50 text-emerald-600' : 
                            r.status === 'sin lecturas' ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
