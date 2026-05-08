import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { HardDrive, ChevronRight, Wifi, WifiOff, RefreshCw } from 'lucide-react';

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
      setDevices(data);
    } catch (e: any) {
      setError(e.message);
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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispositivos</h1>
          <p className="text-gray-500 mt-1">
            Inventario global de impresoras — {devices.length} dispositivo(s)
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-40"
          title="Actualizar">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Search */}
      <div className="relative">
        <HardDrive className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="Filtrar por IP, serial, marca, modelo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#111827] border border-gray-800 rounded-2xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder:text-gray-600"
        />
      </div>

      {loading && <div className="text-center py-20 text-gray-500">Cargando dispositivos...</div>}
      {error   && <div className="text-center py-20 text-red-400">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <HardDrive size={48} className="mx-auto mb-4 text-gray-700" />
          <p className="text-gray-500">{search ? 'Sin resultados para la búsqueda.' : 'No hay dispositivos registrados.'}</p>
        </div>
      )}

      {!loading && !error && Object.values(byClient).map(({ clientName, devices: clientDevices }) => (
        <div key={clientName} className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-3">
            <span className="h-px bg-gray-800 flex-1" />
            {clientName} ({clientDevices.length})
            <span className="h-px bg-gray-800 flex-1" />
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clientDevices.map(device => (
              <Link
                key={device.id}
                to={`/devices/${device.id}`}
                className="bg-[#111827] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl">
                    <HardDrive size={18} className="text-blue-400" />
                  </div>
                  {device.active ? (
                    <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-lg">
                      <Wifi size={10} /> Activo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-700/30 px-2 py-0.5 rounded-lg">
                      <WifiOff size={10} /> Inactivo
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-white truncate text-sm">{device.name || device.ip}</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {device.brand?.toUpperCase()} — {device.model?.slice(0, 30)}
                </p>

                <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                  <div>
                    <div className="font-mono">{device.ip}</div>
                    <div className="text-gray-700 mt-0.5">{device.monitor_name}</div>
                  </div>
                  <ChevronRight size={14} className="group-hover:text-gray-400 transition-colors shrink-0" />
                </div>

                {device.serial && (
                  <div className="mt-1 text-xs text-gray-700 font-mono truncate">SN: {device.serial}</div>
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
