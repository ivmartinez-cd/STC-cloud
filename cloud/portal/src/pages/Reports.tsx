import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { FileText, Download, Search, Calendar, User, Printer, Filter } from 'lucide-react';

interface Client  { id: string; name: string }
interface Device  { id: string; name: string; ip: string; brand: string }
interface Reading {
  time:        string;
  total_pages: number;
  mono_pages:  number | null;
  color_pages: number | null;
  status:      string;
}

const today    = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

function toCSV(rows: Reading[], deviceLabel: string): string {
  const header = 'Fecha,Total Páginas,Monocromo,Color,Estado';
  const lines  = rows.map(r =>
    [new Date(r.time).toLocaleString(), r.total_pages, r.mono_pages ?? '', r.color_pages ?? '', r.status].join(',')
  );
  return `# Reporte de Contadores: ${deviceLabel}\n${header}\n${lines.join('\n')}`;
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
  const [devices, setDevices]   = useState<Device[]>([]);
  const [clientId, setClientId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [from, setFrom]         = useState(monthAgo);
  const [to, setTo]             = useState(today);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get<Client[]>('/clients').then(data => setClients(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) { setDevices([]); setDeviceId(''); return; }
    api.get<Device[]>(`/clients/${clientId}/devices`)
      .then(d => { 
        const data = Array.isArray(d) ? d : [];
        setDevices(data); 
        setDeviceId(data[0]?.id || ''); 
      })
      .catch(() => {});
  }, [clientId]);

  const generate = async () => {
    if (!deviceId) return;
    setLoading(true); setError(''); setReadings(null);
    try {
      const data = await api.get<Reading[]>(
        `/devices/${deviceId}/readings?from=${from}T00:00:00Z&to=${to}T23:59:59Z&limit=5000`
      );
      setReadings(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!readings) return;
    const dev   = devices.find(d => d.id === deviceId);
    const label = dev ? `${dev.brand?.toUpperCase()} ${dev.ip}` : deviceId;
    downloadCSV(toCSV(readings, label), `reporte_${label}_${from}_${to}.csv`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Reportes de Contadores</h1>
        <p className="text-slate-500 mt-1 font-medium">Análisis histórico y auditoría de lecturas por dispositivo</p>
      </header>

      {/* Filters */}
      <div className="cd-panel p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 text-brand rounded-xl">
            <Filter size={20} />
          </div>
          <h3 className="text-lg font-extrabold text-[#1a2333]">Parámetros de Búsqueda</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
            <div className="relative">
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={clientId} 
                onChange={e => setClientId(e.target.value)} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand"
              >
                <option value="">Seleccionar cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Dispositivo</label>
            <div className="relative">
              <Printer size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                value={deviceId} 
                onChange={e => setDeviceId(e.target.value)}
                disabled={!clientId} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand disabled:opacity-40"
              >
                <option value="">Seleccionar dispositivo</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.brand?.toUpperCase()} — {d.name || d.ip}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Fecha Inicial</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="date" 
                value={from} 
                onChange={e => setFrom(e.target.value)} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Fecha Final</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="date" 
                value={to} 
                onChange={e => setTo(e.target.value)} 
                className="cd-input w-full !pl-10 !bg-slate-50 border-transparent focus:!bg-white focus:!border-brand" 
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-slate-50">
          <button
            onClick={generate}
            disabled={!deviceId || loading}
            className="flex-1 flex items-center justify-center gap-2 bg-brand hover:bg-[#2471a3] disabled:opacity-40 text-white px-8 py-4 rounded-2xl text-sm font-extrabold shadow-lg shadow-blue-900/10 transition-all active:scale-95"
          >
            <Search size={18} />
            {loading ? 'Generando Reporte...' : 'Generar Reporte Detallado'}
          </button>
          
          {readings && readings.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl text-sm font-extrabold shadow-lg shadow-emerald-900/10 transition-all active:scale-95 animate-in zoom-in-95"
            >
              <Download size={18} />
              Exportar a CSV ({readings.length} registros)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-6 text-rose-600 text-sm font-bold animate-in shake">
          Error: {error}
        </div>
      )}

      {/* Results */}
      {readings !== null && (
        <div className="cd-panel overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <header className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
            <h3 className="font-extrabold text-[#1a2333] flex items-center gap-3">
              <div className="p-2 bg-white rounded-xl shadow-sm text-brand">
                <FileText size={18} />
              </div>
              Lecturas Encontradas
            </h3>
            <span className="bg-slate-200 text-slate-600 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
              {readings.length} Resultados
            </span>
          </header>

          {readings.length === 0 ? (
            <div className="text-center py-20 bg-white">
              <FileText size={48} className="mx-auto mb-4 text-slate-100" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sin registros en este período</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th className="text-right">Total Acumulado</th>
                    <th className="text-right">Monocromo</th>
                    <th className="text-right">Color</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="font-medium text-slate-500 whitespace-nowrap text-xs">
                        {new Date(r.time).toLocaleString()}
                      </td>
                      <td className="text-right font-extrabold text-[#1a2333]">
                        {r.total_pages.toLocaleString()}
                      </td>
                      <td className="text-right text-slate-400 font-bold">
                        {r.mono_pages?.toLocaleString() ?? '---'}
                      </td>
                      <td className="text-right text-slate-400 font-bold">
                        {r.color_pages?.toLocaleString() ?? '---'}
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          r.status === 'ok' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {readings.length > 100 && (
                <div className="bg-slate-50/50 px-8 py-4 border-t border-slate-50">
                  <p className="text-center text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Vista previa limitada a 100 registros. Use el botón de exportación para obtener el historial completo.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;

