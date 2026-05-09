import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronRight, WifiOff, RefreshCw, Search, Printer } from 'lucide-react';

interface Device {
  id: string;
  ip: string;
  serial: string | null;
  brand: string;
  model: string;
  name: string;
  active: boolean;
  monitor_name: string;
  client_name: string;
}

const Devices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Device[]>('/devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = devices.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.ip?.toLowerCase().includes(q) ||
      d.serial?.toLowerCase().includes(q) ||
      d.brand?.toLowerCase().includes(q) ||
      d.model?.toLowerCase().includes(q) ||
      d.name?.toLowerCase().includes(q) ||
      d.client_name?.toLowerCase().includes(q) ||
      d.monitor_name?.toLowerCase().includes(q)
    );
  });

  // Group by client
  const byClient = filtered.reduce<Record<string, { clientName: string; devices: Device[] }>>((acc, d) => {
    const key = d.client_name || 'Sin cliente';
    if (!acc[key]) acc[key] = { clientName: key, devices: [] };
    acc[key].devices.push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Inventario de Dispositivos</h1>
          <p className="text-slate-500 mt-1 font-medium">
            Control global de impresoras — {devices.length} dispositivo(s)
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} disabled={loading}
            className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-[#2980b9] hover:border-[#2980b9] rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-40"
            title="Actualizar">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#2980b9] transition-colors" size={20} />
        <input
          type="text"
          placeholder="Filtrar por IP, serial, marca, modelo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="cd-input w-full !pl-14 !h-14 shadow-sm"
        />
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 animate-pulse">
          <div className="p-4 bg-blue-50 rounded-full text-[#2980b9] mb-4">
            <RefreshCw size={32} className="animate-spin" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Cargando inventario...</p>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-8 text-center animate-in zoom-in-95">
          <div className="w-16 h-16 bg-rose-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl shadow-rose-900/20">
            <WifiOff size={32} />
          </div>
          <h3 className="text-lg font-bold text-rose-900">Error de conexión</h3>
          <p className="text-rose-600 mt-1 font-medium">{error}</p>
          <button onClick={load} className="mt-6 px-6 py-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-all active:scale-95">
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white rounded-[32px] border border-slate-100 p-20 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center mx-auto mb-6 text-slate-300">
            <Printer size={40} />
          </div>
          <h3 className="text-xl font-bold text-[#1a2333]">No se encontraron resultados</h3>
          <p className="text-slate-500 mt-2 font-medium">{search ? 'Intenta con otros términos de búsqueda.' : 'No hay dispositivos registrados aún.'}</p>
        </div>
      )}

      {!loading && !error && Object.values(byClient).map(({ clientName, devices: clientDevices }) => (
        <div key={clientName} className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4">
            <h2 className="text-xs font-extrabold text-[#2980b9] uppercase tracking-[0.2em] whitespace-nowrap">
              {clientName} <span className="text-slate-400 font-bold ml-2">({clientDevices.length})</span>
            </h2>
            <div className="h-px bg-slate-100 flex-1" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {clientDevices.map(device => (
              <Link
                key={device.id}
                to={`/devices/${device.id}`}
                className="cd-panel p-6 group hover:border-[#2980b9]/30 transition-all flex flex-col h-full"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl group-hover:bg-[#2980b9] group-hover:text-white transition-all duration-300">
                    <Printer size={20} />
                  </div>
                  {device.active ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Activo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                      <WifiOff size={12} />
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="font-extrabold text-[#1a2333] group-hover:text-[#2980b9] transition-colors truncate">
                    {device.name || device.ip}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">
                    {device.brand?.toUpperCase() || 'Genérico'} — <span className="opacity-70">{device.model || 'S/M'}</span>
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-50 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-[11px] font-mono font-bold text-[#2980b9] bg-blue-50 px-2 py-0.5 rounded-md inline-block">
                      {device.ip}
                    </div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest truncate max-w-[140px]">
                      {device.monitor_name}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-[#2980b9]/10 group-hover:text-[#2980b9] transition-all">
                    <ChevronRight size={16} />
                  </div>
                </div>

                {device.serial && (
                  <div className="mt-3 text-[9px] font-bold text-slate-300 uppercase tracking-widest truncate">
                    S/N: {device.serial}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Devices;

