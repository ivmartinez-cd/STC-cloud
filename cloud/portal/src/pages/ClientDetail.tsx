import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  HardDrive, ChevronRight, Users, Radio,
  MapPin, Mail, Phone, BarChart2, Plus, X, Loader2, Copy, Check, Trash2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import ConfirmModal from '../components/ConfirmModal';

interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  monitor_count: number;
  device_count: number;
}

interface Monitor {
  id: string;
  name: string;
  status: string;
  last_seen: string | null;
  device_count: number;
  scan_interval_minutes: number;
}

interface UsageMonth {
  month: string;
  mono: number;
  color: number;
}


function MonitorStatusBadge({ status }: { status: string }) {
  const isOnline = status === 'online' || status === 'active';
  const isOffline = status === 'offline' || status === 'inactive';

  if (isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#689f38] bg-[#689f38]/10 px-2.5 py-1 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-[#689f38]" /> Activo
      </span>
    );
  }
  if (isOffline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {status}
    </span>
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [client, setClient]   = useState<Client | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [usage, setUsage]     = useState<UsageMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // New Monitor modal
  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [monitorSubmitting, setMonitorSubmitting] = useState(false);
  const [activationKey, setActivationKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [monitorForm, setMonitorForm] = useState({
    name: '',
    ipStart: '',
    ipEnd: '',
    snmp_community: 'public',
    scan_interval_minutes: 15,
  });

  // Delete Monitor modal
  const [monitorToDelete, setMonitorToDelete] = useState<{ id: string, name: string } | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get<Client>(`/clients/${id}`),
      api.get<Monitor[]>(`/clients/${id}/monitors`),
      api.get<UsageMonth[]>(`/clients/${id}/usage`),
    ])
      .then(([c, m, u]) => {
        setClient(c); setMonitors(m); setUsage(u);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setMonitorSubmitting(true);
    try {
      const payload: any = {
        clientId: id,
        name: monitorForm.name,
        snmp_community: monitorForm.snmp_community,
        scan_interval_minutes: monitorForm.scan_interval_minutes,
      };
      if (monitorForm.ipStart && monitorForm.ipEnd) {
        payload.ip_ranges = [{ start: monitorForm.ipStart, end: monitorForm.ipEnd }];
      }
      const result = await api.post<{ key: string }>('/agents', payload);
      const key = (result as any).key || (result as any).activationKey || (result as any).activation_key;
      setActivationKey(key || '');
      // Refresh list in background so it's ready when modal closes
      fetchData();
    } catch (err: any) {
      alert('Error al crear monitor: ' + err.message);
    } finally {
      setMonitorSubmitting(false);
    }
  };

  const closeMonitorModal = () => {
    setShowMonitorModal(false);
    setActivationKey('');
    setKeyCopied(false);
    setMonitorForm({ name: '', ipStart: '', ipEnd: '', snmp_community: 'public', scan_interval_minutes: 15 });
  };

  const copyKey = () => {
    navigator.clipboard.writeText(activationKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const confirmDeleteMonitor = async () => {
    if (!monitorToDelete) return;
    setDeletingMonitor(true);
    try {
      await api.delete(`/agents/${monitorToDelete.id}`);
      setMonitorToDelete(null);
      fetchData();
    } catch (err: any) {
      alert('Error al eliminar monitor: ' + err.message);
    } finally {
      setDeletingMonitor(false);
    }
  };

  const onlineMonitors  = monitors.filter(m => m.status === 'online' || m.status === 'active').length;
  const totalPagesMonth = usage.length > 0
    ? usage[usage.length - 1].mono + usage[usage.length - 1].color
    : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link to="/clients" className="flex items-center gap-1 hover:text-[#2980b9] transition-colors">
          <Users size={12} /> Clientes
        </Link>
        <ChevronRight size={12} className="text-slate-300" />
        {client ? (
          <span className="text-[#1a2333] font-medium">{client.name}</span>
        ) : (
          <span className="text-slate-300">Cargando...</span>
        )}
      </nav>

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Cargando cliente...</div>}
      {error   && <div className="text-center py-16 text-red-500 text-sm">{error}</div>}

      {!loading && !error && client && (
        <>
          {/* 3-block header */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Left — stat widgets */}
            <div className="flex flex-col gap-3">
              <div className="cd-panel rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-[#2980b9]/10 rounded-lg">
                  <HardDrive size={18} className="text-[#2980b9]" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#1a2333]">{client.device_count}</div>
                  <div className="text-xs text-slate-500">
                    Dispositivos activos
                  </div>
                </div>
              </div>
              <div className="cd-panel rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-[#2980b9]/10 rounded-lg">
                  <Radio size={18} className="text-[#2980b9]" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#1a2333]">{monitors.length}</div>
                  <div className="text-xs text-slate-500">
                    Monitores — <span className="text-[#689f38] font-medium">{onlineMonitors} online</span>
                  </div>
                </div>
              </div>
              <div className="cd-panel rounded-xl p-4 flex items-center gap-4">
                <div className="p-2.5 bg-[#f39c12]/10 rounded-lg">
                  <BarChart2 size={18} className="text-[#f39c12]" />
                </div>
                <div>
                  <div className="text-xl font-bold text-[#1a2333]">{totalPagesMonth.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Páginas este mes</div>
                </div>
              </div>
            </div>

            {/* Center — client info card */}
            <div className="cd-panel rounded-xl p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-[#2980b9] rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Users size={22} className="text-white" />
                </div>
                <h1 className="text-xl font-bold text-[#1a2333] truncate leading-tight">
                  {client.name}
                  <span className="block text-xs font-normal text-slate-400 mt-0.5 tracking-wide uppercase">Cliente Registrado</span>
                </h1>
              </div>

              <div className="space-y-3.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Contacto Principal</div>
                
                {client.contact_name && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 group">
                    <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                      <Users size={14} className="text-slate-400 group-hover:text-[#2980b9]" />
                    </div>
                    <span className="font-medium">{client.contact_name}</span>
                  </div>
                )}
                
                {client.contact_email && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 group">
                    <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                      <Mail size={14} className="text-slate-400 group-hover:text-[#2980b9]" />
                    </div>
                    <span className="truncate">{client.contact_email}</span>
                  </div>
                )}

                {(client.address || client.country) && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 group pt-1">
                    <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                      <MapPin size={14} className="text-slate-400 group-hover:text-[#2980b9]" />
                    </div>
                    <span className="truncate text-xs">
                      {[client.address, client.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}

                {!client.contact_name && !client.contact_email && !client.address && (
                  <p className="text-sm text-slate-400 italic">Sin información de contacto detallada.</p>
                )}
              </div>
            </div>

            {/* Right — monthly usage chart */}
            <div className="cd-panel rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 size={13} className="text-[#2980b9]" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Páginas por mes</span>
              </div>
              {usage.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                  Sin datos de uso
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={usage} barSize={10} barGap={2}>
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #d1d8e0', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#1a2333' }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                    <Bar dataKey="mono"  name="Mono"  fill="#2980b9" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="color" name="Color" fill="#f39c12" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Monitores header + Add Monitor */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1a2333] uppercase tracking-wider flex items-center gap-2">
              <Radio size={14} className="text-[#2980b9]" />
              Monitores ({monitors.length})
            </h2>
            <button
              onClick={() => setShowMonitorModal(true)}
              className="bg-[#f39c12] hover:bg-[#e67e22] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold shadow-md transition-all active:scale-95"
            >
              <Plus size={18} />
              Nuevo Monitor
            </button>
          </div>

          {/* Monitors table */}
          <div className="cd-panel rounded-xl overflow-hidden">
            {monitors.length === 0 ? (
              <div className="text-center py-14">
                <Radio size={36} className="mx-auto mb-3 text-slate-300" />
                <p className="text-slate-400 text-sm">No hay monitores configurados para este cliente.</p>
              </div>
            ) : (
              <table className="w-full text-sm cd-table">
                <thead>
                  <tr className="bg-[#2980b9] text-white text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 text-left font-semibold">Monitor</th>
                    <th className="px-5 py-3 text-left font-semibold">Estado</th>
                    <th className="px-5 py-3 text-left font-semibold hidden md:table-cell">Última actividad</th>
                    <th className="px-5 py-3 text-center font-semibold">Dispositivos</th>
                    <th className="px-5 py-3 text-left font-semibold hidden lg:table-cell">Intervalo</th>
                    <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {monitors.map(m => (
                    <tr key={m.id} className="border-t border-[#d1d8e0]">
                      <td className="px-5 py-3">
                        <Link to={`/monitors/${m.id}`} className="flex items-center gap-2.5 group/m">
                          <div className="p-1.5 bg-[#2980b9]/10 rounded">
                            <Radio size={12} className="text-[#2980b9]" />
                          </div>
                          <span className="font-medium text-[#1a2333] text-sm group-hover/m:text-[#2980b9] transition-colors">{m.name}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <MonitorStatusBadge status={m.status} />
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-slate-400 text-xs">
                        {timeAgo(m.last_seen)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Link to={`/monitors/${m.id}/devices`} className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-sm font-semibold text-[#2980b9] hover:bg-[#2980b9] hover:text-white transition-colors cursor-pointer" title="Ver dispositivos">
                          {m.device_count}
                        </Link>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-slate-400 text-xs">
                        {m.scan_interval_minutes} min
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setMonitorToDelete({ id: m.id, name: m.name })}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar Monitor"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* Add Monitor Modal */}
          {showMonitorModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#2980b9] text-white">
                  <h2 className="font-bold">{activationKey ? 'Monitor Creado' : 'Nuevo Monitor'}</h2>
                  <button onClick={closeMonitorModal} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </header>

                {activationKey ? (
                  <div className="p-6 space-y-4">
                    <div className="bg-[#689f38]/10 border border-[#689f38]/30 rounded-xl p-4">
                      <p className="text-sm font-semibold text-[#689f38] mb-1">¡Monitor creado exitosamente!</p>
                      <p className="text-xs text-slate-500">Usa esta clave de activación en el instalador del agente:</p>
                    </div>
                    <div className="relative">
                      <input
                        readOnly
                        value={activationKey}
                        className="cd-input w-full font-mono text-xs pr-10"
                      />
                      <button
                        onClick={copyKey}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-slate-100 transition-colors"
                        title="Copiar clave"
                      >
                        {keyCopied ? <Check size={14} className="text-[#689f38]" /> : <Copy size={14} className="text-slate-400" />}
                      </button>
                    </div>
                    <button
                      onClick={closeMonitorModal}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#2980b9] text-white font-bold hover:bg-[#2471a3] transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateMonitor} className="p-6 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre del Monitor (Sucursal) *</label>
                      <input
                        required
                        type="text"
                        className="cd-input w-full"
                        placeholder="Ej: Oficina Central"
                        value={monitorForm.name}
                        onChange={e => setMonitorForm({ ...monitorForm, name: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">IP Inicio</label>
                        <input
                          type="text"
                          className="cd-input w-full font-mono text-xs"
                          placeholder="192.168.1.1"
                          value={monitorForm.ipStart}
                          onChange={e => {
                            const val = e.target.value;
                            const parts = val.split('.');
                            // Mirror everything until we reach the 4th octet (3 dots)
                            const newIpEnd = parts.length <= 3 
                              ? val 
                              : parts.slice(0, 3).join('.') + '.';
                            setMonitorForm({ ...monitorForm, ipStart: val, ipEnd: newIpEnd });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">IP Fin</label>
                        <input
                          type="text"
                          className="cd-input w-full font-mono text-xs"
                          placeholder="192.168.1.254"
                          value={monitorForm.ipEnd}
                          onFocus={e => {
                            const val = e.target.value;
                            e.target.setSelectionRange(val.length, val.length);
                          }}
                          onChange={e => setMonitorForm({ ...monitorForm, ipEnd: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comunidad SNMP</label>
                        <input
                          type="text"
                          className="cd-input w-full"
                          placeholder="public"
                          value={monitorForm.snmp_community}
                          onChange={e => setMonitorForm({ ...monitorForm, snmp_community: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Intervalo (min)</label>
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          className="cd-input w-full"
                          value={monitorForm.scan_interval_minutes}
                          onChange={e => setMonitorForm({ ...monitorForm, scan_interval_minutes: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={closeMonitorModal}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={monitorSubmitting}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-[#f39c12] text-white font-bold hover:bg-[#e67e22] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {monitorSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Crear Monitor'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        isOpen={!!monitorToDelete}
        onClose={() => setMonitorToDelete(null)}
        onConfirm={confirmDeleteMonitor}
        isLoading={deletingMonitor}
        isDanger
        title="Eliminar Monitor"
        message={`¿Estás seguro de que deseas eliminar el monitor "${monitorToDelete?.name}"? Esta acción borrará también todos sus dispositivos y lecturas de forma permanente.`}
        confirmText="Eliminar"
      />
    </div>
  );
};

export default ClientDetail;
