import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ChevronRight, Users, HardDrive } from 'lucide-react';

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

const MonitorDevices = () => {
  const { id } = useParams<{ id: string }>();
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<MonitorData>(`/agents/${id}`),
      api.get<Device[]>(`/agents/${id}/devices`),
    ])
      .then(([m, d]) => { setMonitor(m); setDevices(d); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-16 text-slate-400">Cargando dispositivos...</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;
  if (!monitor) return null;

  function cleanModelName(model: string | null, brand: string | null): string {
    if (!model) return '—';
    let cleaned = model.split(';')[0].trim();
    if (brand && cleaned.toLowerCase().startsWith(brand.toLowerCase())) {
      cleaned = cleaned.substring(brand.length).trim();
    }
    return cleaned || '—';
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* App Standard Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
        <Link to="/clients" className="flex items-center gap-1 hover:text-[#2980b9] transition-colors">
          <Users size={12} /> Clientes
        </Link>
        <ChevronRight size={12} className="text-slate-300" />
        <Link to={`/clients/${monitor.client_id}`} className="hover:text-[#2980b9] transition-colors">
          {monitor.client_name}
        </Link>
        <ChevronRight size={12} className="text-slate-300" />
        <Link to={`/monitors/${monitor.id}`} className="hover:text-[#2980b9] transition-colors">
          {monitor.name}
        </Link>
        <ChevronRight size={12} className="text-slate-300" />
        <span className="text-[#1a2333] font-medium">Todos los dispositivos</span>
      </nav>

      {/* Main Panel */}
      <div className="cd-panel rounded-xl overflow-hidden flex flex-col">
        {/* Header/Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#1a2333] flex items-center gap-2">
              <HardDrive size={20} className="text-[#2980b9]" />
              Dispositivos
            </h1>
            <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Exportar CSV
            </button>
          </div>
          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {devices.length} dispositivo(s)
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-x-auto">
          {devices.length === 0 ? (
            <div className="text-center py-20">
              <HardDrive size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-400">No hay dispositivos registrados en este monitor.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-left text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Cliente</th>
                  <th className="px-6 py-4 font-semibold">Monitor</th>
                  <th className="px-6 py-4 font-semibold">Nombre</th>
                  <th className="px-6 py-4 font-semibold">Nro. Serie</th>
                  <th className="px-6 py-4 font-semibold">Dirección IP</th>
                  <th className="px-6 py-4 font-semibold">Fabricante</th>
                  <th className="px-6 py-4 font-semibold">Modelo</th>
                  <th className="px-6 py-4 font-semibold text-center">Estado</th>
                  <th className="px-6 py-4 font-semibold">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {devices.map((d) => (
                  <tr 
                    key={d.id} 
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/devices/${d.id}`}
                  >
                    <td className="px-6 py-3 font-medium text-[#2980b9]">
                      {monitor.client_name}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {monitor.name}
                    </td>
                    <td className="px-6 py-3 font-medium text-[#1a2333]">
                      {d.name || d.ip}
                    </td>
                    <td className="px-6 py-3 font-mono text-slate-500">
                      {d.serial || '—'}
                    </td>
                    <td className="px-6 py-3 font-mono text-[#1a2333]">
                      {d.ip}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {d.brand?.toUpperCase() || '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {cleanModelName(d.model, d.brand)}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {d.active ? (
                        <span className="inline-flex items-center gap-1.5 text-[#689f38] bg-[#689f38]/10 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#689f38]" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {formatDate(d.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonitorDevices;
