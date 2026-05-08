import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { FileText, Download, Search } from 'lucide-react';

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
    api.get<Client[]>('/clients').then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) { setDevices([]); setDeviceId(''); return; }
    api.get<Device[]>(`/clients/${clientId}/devices`)
      .then(d => { setDevices(d); setDeviceId(d[0]?.id || ''); })
      .catch(() => {});
  }, [clientId]);

  const generate = async () => {
    if (!deviceId) return;
    setLoading(true); setError(''); setReadings(null);
    try {
      const data = await api.get<Reading[]>(
        `/devices/${deviceId}/readings?from=${from}T00:00:00Z&to=${to}T23:59:59Z&limit=5000`
      );
      setReadings(data);
    } catch (e: any) {
      setError(e.message);
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

  const selectCls = 'cd-input w-full';

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-[#1a2333]">Reportes de Lectura</h1>
        <p className="text-slate-500 text-sm mt-0.5">Exporta historial de contadores por dispositivo y período.</p>
      </header>

      {/* Filters */}
      <div className="cd-panel rounded-xl p-5">
        <h3 className="font-semibold text-[#1a2333] text-sm mb-4">Parámetros del reporte</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Cliente</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={selectCls}>
              <option value="">Seleccionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Dispositivo</label>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
              disabled={!clientId} className={`${selectCls} disabled:opacity-40 disabled:cursor-not-allowed`}>
              <option value="">Seleccionar dispositivo</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.brand?.toUpperCase()} — {d.name || d.ip}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={selectCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={selectCls} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={generate}
            disabled={!deviceId || loading}
            className="flex items-center gap-2 bg-[#f39c12] hover:bg-[#e67e22] disabled:opacity-40 text-white px-5 py-2 rounded text-sm font-medium transition-colors"
          >
            <Search size={14} />
            {loading ? 'Generando...' : 'Generar reporte'}
          </button>
          {readings && readings.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 bg-[#689f38] hover:bg-[#558b2f] text-white px-5 py-2 rounded text-sm font-medium transition-colors"
            >
              <Download size={14} />
              Exportar CSV ({readings.length} filas)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>
      )}

      {/* Results */}
      {readings !== null && (
        <div className="cd-panel rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#d1d8e0]">
            <h3 className="font-semibold text-[#1a2333] text-sm flex items-center gap-2">
              <FileText size={15} className="text-[#2980b9]" />
              {readings.length} lecturas encontradas
            </h3>
          </div>

          {readings.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No hay lecturas en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm cd-table">
                <thead>
                  <tr className="bg-[#2980b9] text-white text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                    <th className="px-5 py-3 text-right font-semibold">Mono</th>
                    <th className="px-5 py-3 text-right font-semibold">Color</th>
                    <th className="px-5 py-3 text-left font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t border-[#d1d8e0]">
                      <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                        {new Date(r.time).toLocaleString()}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold text-[#1a2333]">
                        {r.total_pages.toLocaleString()}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-500">
                        {r.mono_pages?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right text-slate-500">
                        {r.color_pages?.toLocaleString() ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 capitalize text-xs text-slate-500">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {readings.length > 100 && (
                <p className="text-center text-xs text-slate-400 py-3">
                  Mostrando primeras 100 filas. Usa "Exportar CSV" para ver todas.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;
