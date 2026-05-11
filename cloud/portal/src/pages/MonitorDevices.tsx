import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronRight, Users, HardDrive, FileText, Loader2, Search, Filter } from 'lucide-react';

interface MonitorData {
  id: string;
  name: string;
  client_name: string;
  client_id: string;
}

interface Device {
  id: string;
  ip: string;
  serial: string | null;
  brand: string;
  model: string;
  name: string;
  active: boolean;
  created_at: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function cleanModelName(model: string | null, brand: string | null): string {
  if (!model) return '—';
  let cleaned = model.split(';')[0].trim();
  if (brand && cleaned.toLowerCase().startsWith(brand.toLowerCase())) {
    cleaned = cleaned.substring(brand.length).trim();
  }
  return cleaned || '—';
}

const MonitorDevices = () => {
  const { id } = useParams<{ id: string }>();
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<MonitorData>(`/agents/${id}`),
      api.get<Device[]>(`/agents/${id}/devices`),
    ])
      .then(([m, d]) => { setMonitor(m); setDevices(Array.isArray(d) ? d : []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const filteredDevices = devices.filter(d => 
    d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.ip.includes(searchTerm) ||
    d.serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/clients" className="flex items-center gap-2 text-slate-400 hover:text-brand font-bold uppercase tracking-widest transition-colors">
          <Users size={14} /> Clientes
        </Link>
        <ChevronRight size={14} className="text-slate-300" />
        {monitor ? (
          <>
            <Link to={`/clients/${monitor.client_id}`} className="text-slate-400 hover:text-brand font-bold uppercase tracking-widest transition-colors">
              {monitor.client_name}
            </Link>
            <ChevronRight size={14} className="text-slate-300" />
            <Link to={`/monitors/${monitor.id}`} className="text-slate-400 hover:text-brand font-bold uppercase tracking-widest transition-colors">
              {monitor.name}
            </Link>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-brand font-extrabold uppercase tracking-widest">Inventario de Dispositivos</span>
          </>
        ) : (
          <div className="h-4 w-48 bg-slate-100 animate-pulse rounded-full" />
        )}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-brand" size={40} />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">Cargando inventario del monitor...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-8 text-rose-600 font-bold animate-in shake">
          {error}
        </div>
      )}

      {!loading && !error && monitor && (
        <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5">
          {/* Toolbar */}
          <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-brand rounded-2xl">
                <HardDrive size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black text-[#1a2333] tracking-tight">Inventario Completo</h1>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  {filteredDevices.length} dispositivos encontrados en {monitor.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-1 max-w-md">
              <div className="relative flex-1 group">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar por IP, Serie o Modelo..."
                  className="cd-input w-full !pl-12 !py-3 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl transition-all active:scale-95 border border-slate-100">
                <Filter size={18} />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {filteredDevices.length === 0 ? (
              <div className="text-center py-24 bg-white">
                <div className="p-6 bg-slate-50 inline-block rounded-full mb-6">
                  <Search size={48} className="text-slate-200" />
                </div>
                <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">No se encontraron dispositivos que coincidan</p>
              </div>
            ) : (
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Nombre de Red</th>
                    <th>Nro. Serie</th>
                    <th>Dirección IP</th>
                    <th>Fabricante / Modelo</th>
                    <th className="text-center">Estado</th>
                    <th className="text-right">Registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => (
                    <tr 
                      key={d.id} 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group/row"
                      onClick={() => window.location.href = `/devices/${d.id}`}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-50 rounded-xl group-hover/row:bg-blue-50 transition-colors">
                            <FileText size={16} className="text-slate-400 group-hover/row:text-brand" />
                          </div>
                          <span className="font-extrabold text-[#1a2333] group-hover/row:text-brand transition-colors uppercase tracking-tight">
                            {d.name || d.ip}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs font-bold text-slate-500 uppercase">
                          {d.serial || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-sm font-black text-[#1a2333]">
                          {d.ip}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-brand uppercase tracking-tighter">
                            {d.brand?.toUpperCase() || 'Genérico'}
                          </span>
                          <span className="text-xs font-bold text-slate-600 truncate max-w-[200px]">
                            {cleanModelName(d.model, d.brand)}
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        {d.active ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter">
                          {formatDate(d.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Fin del Inventario Corporativo</span>
            <button className="text-[10px] font-black text-brand uppercase tracking-widest hover:underline">
              Exportar Reporte Maestro
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitorDevices;
