import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  HardDrive, ChevronRight, Users, Radio,
  MapPin, Mail, BarChart2, Plus, X, Loader2, Copy, Check, Trash2, 
  Layout, Info, TrendingUp, Clock, Shield
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  address: string | null;
  country: string | null;
  contact_phone: string | null;
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
  const isOnline = status === 'online' || status === 'active' || status === 'ok';
  
  if (isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
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
  const { showToast } = useToast();
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

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Client>(`/clients/${id}`),
      api.get<Monitor[]>(`/clients/${id}/monitors`),
      api.get<UsageMonth[]>(`/clients/${id}/usage`),
    ])
      .then(([c, m, u]) => {
        setClient(c); 
        setMonitors(Array.isArray(m) ? m : []); 
        setUsage(Array.isArray(u) ? u : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setMonitorSubmitting(true);
    try {
      const payload: {
        clientId?: string;
        name: string;
        snmp_community: string;
        scan_interval_minutes: number;
        ip_ranges?: Array<{ start: string; end: string }>;
      } = {
        clientId: id,
        name: monitorForm.name,
        snmp_community: monitorForm.snmp_community,
        scan_interval_minutes: monitorForm.scan_interval_minutes,
      };
      if (monitorForm.ipStart && monitorForm.ipEnd) {
        payload.ip_ranges = [{ start: monitorForm.ipStart, end: monitorForm.ipEnd }];
      }
      const result = await api.post<{ key?: string; activationKey?: string; activation_key?: string }>('/agents', payload);
      const key = result.key || result.activationKey || result.activation_key;
      setActivationKey(key || '');
      showToast('Monitor creado exitosamente', 'success');
      fetchData();
    } catch (err: unknown) {
      showToast('Error al crear monitor: ' + (err as Error).message, 'error');
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
    showToast('Clave copiada al portapapeles', 'success');
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const confirmDeleteMonitor = async () => {
    if (!monitorToDelete) return;
    setDeletingMonitor(true);
    try {
      await api.delete(`/agents/${monitorToDelete.id}`);
      showToast(`Monitor ${monitorToDelete.name} eliminado`, 'success');
      setMonitorToDelete(null);
      fetchData();
    } catch (err: unknown) {
      showToast('Error al eliminar monitor: ' + (err as Error).message, 'error');
    } finally {
      setDeletingMonitor(false);
    }
  };

  const onlineMonitors  = monitors.filter(m => m.status === 'online' || m.status === 'active' || m.status === 'ok').length;
  const totalPagesMonth = usage.length > 0
    ? usage[usage.length - 1].mono + usage[usage.length - 1].color
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/clients" className="flex items-center gap-2 text-slate-400 hover:text-[#2980b9] font-bold uppercase tracking-widest transition-colors">
          <Users size={14} /> Clientes
        </Link>
        <ChevronRight size={14} className="text-slate-300" />
        {client ? (
          <span className="text-[#2980b9] font-extrabold uppercase tracking-widest">{client.name}</span>
        ) : (
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded-full" />
        )}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-[#2980b9]" size={40} />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">Cargando expediente del cliente...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-8 text-rose-600 font-bold animate-in shake">
          {error}
        </div>
      )}

      {!loading && !error && client && (
        <>
          {/* Header Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Metrics */}
            <div className="flex flex-col gap-4">
              <div className="cd-panel p-5 border-l-4 border-l-[#2980b9] flex items-center gap-5">
                <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl">
                  <HardDrive size={24} />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{client.device_count}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Dispositivos</div>
                </div>
              </div>
              
              <div className="cd-panel p-5 border-l-4 border-l-emerald-500 flex items-center gap-5">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Radio size={24} />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{monitors.length}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Monitores — <span className="text-emerald-500">{onlineMonitors} activos</span>
                  </div>
                </div>
              </div>

              <div className="cd-panel p-5 border-l-4 border-l-amber-500 flex items-center gap-5">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <BarChart2 size={24} />
                </div>
                <div>
                  <div className="text-2xl font-black text-[#1a2333] tracking-tighter">{totalPagesMonth.toLocaleString()}</div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Páginas este mes</div>
                </div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="cd-panel p-8 bg-gradient-to-br from-[#1a2333] to-[#2c3e50] text-white border-none shadow-xl shadow-blue-900/20">
              <div className="flex items-center gap-5 mb-8">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shadow-inner backdrop-blur-sm">
                  <Users size={32} className="text-blue-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight">{client.name}</h1>
                  <span className="text-[10px] font-extrabold text-blue-300/60 uppercase tracking-[0.2em]">Perfil Corporativo</span>
                </div>
              </div>

              <div className="space-y-4">
                {client.contact_name && (
                  <div className="flex items-center gap-4 group">
                    <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10 transition-colors">
                      <Users size={16} className="text-blue-200" />
                    </div>
                    <span className="font-bold text-sm text-slate-200">{client.contact_name}</span>
                  </div>
                )}
                
                {client.contact_email && (
                  <div className="flex items-center gap-4 group">
                    <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10 transition-colors">
                      <Mail size={16} className="text-blue-200" />
                    </div>
                    <span className="text-sm text-slate-300 truncate font-medium">{client.contact_email}</span>
                  </div>
                )}

                {(client.address || client.country) && (
                  <div className="flex items-center gap-4 group">
                    <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10 transition-colors">
                      <MapPin size={16} className="text-blue-200" />
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      {[client.address, client.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Usage Chart */}
            <div className="cd-panel p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-[#1a2333] uppercase tracking-widest flex items-center gap-3 mb-6">
                  <TrendingUp size={16} className="text-[#2980b9]" />
                  Consumo Mensual
                </h3>
                {usage.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-3">
                    <BarChart2 size={32} className="text-slate-100" />
                    <p className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest">Sin historial de uso</p>
                  </div>
                ) : (
                  <div className="h-[140px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={usage} barSize={12} barGap={4}>
                        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ 
                            background: '#fff', 
                            border: 'none', 
                            borderRadius: '12px', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}
                        />
                        <Bar dataKey="mono" name="Mono" fill="#2980b9" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="color" name="Color" fill="#f39c12" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Tendencia</span>
                <TrendingUp size={14} className="text-emerald-500" />
              </div>
            </div>
          </div>

          {/* List Section */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-[#1a2333] tracking-tight flex items-center gap-4">
                <div className="p-2 bg-blue-50 text-[#2980b9] rounded-xl shadow-sm">
                  <Radio size={20} />
                </div>
                Infraestructura de Monitoreo
                <span className="ml-2 px-2.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-extrabold rounded-full tracking-widest">
                  {monitors.length} NODOS
                </span>
              </h2>
              <button
                onClick={() => setShowMonitorModal(true)}
                className="bg-[#2980b9] hover:bg-[#2471a3] text-white px-6 py-3 rounded-2xl flex items-center gap-3 text-sm font-extrabold shadow-lg shadow-blue-900/10 transition-all active:scale-95 group"
              >
                <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                Registrar Nuevo Monitor
              </button>
            </div>

            <div className="cd-panel overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              {monitors.length === 0 ? (
                <div className="text-center py-24 bg-white">
                  <Radio size={64} className="mx-auto mb-6 text-slate-50" />
                  <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">Sin monitores configurados</p>
                </div>
              ) : (
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Identificador del Nodo</th>
                      <th>Estado</th>
                      <th className="hidden md:table-cell">Última Actividad</th>
                      <th className="text-center">Dispositivos</th>
                      <th className="hidden lg:table-cell">Intervalo</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitors.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                        <td>
                          <Link to={`/monitors/${m.id}`} className="flex items-center gap-4 group/m">
                            <div className="p-3 bg-slate-50 rounded-2xl group-hover/m:bg-blue-50 transition-colors">
                              <Radio size={16} className="text-slate-400 group-hover/m:text-[#2980b9]" />
                            </div>
                            <div>
                              <p className="font-extrabold text-[#1a2333] group-hover/m:text-[#2980b9] transition-colors">{m.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ID: {m.id.slice(0, 8)}</p>
                            </div>
                          </Link>
                        </td>
                        <td>
                          <MonitorStatusBadge status={m.status} />
                        </td>
                        <td className="hidden md:table-cell">
                          <div className="flex items-center gap-2 text-slate-500 font-bold text-xs">
                            <Clock size={12} className="text-slate-300" />
                            {timeAgo(m.last_seen)}
                          </div>
                        </td>
                        <td className="text-center">
                          <Link 
                            to={`/monitors/${m.id}/devices`} 
                            className="inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-2xl bg-slate-100 text-sm font-black text-[#2980b9] hover:bg-[#2980b9] hover:text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all active:scale-90"
                          >
                            {m.device_count}
                          </Link>
                        </td>
                        <td className="hidden lg:table-cell">
                          <span className="text-[10px] font-extrabold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            CADA {m.scan_interval_minutes} MIN
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                             <button
                                onClick={() => setMonitorToDelete({ id: m.id, name: m.name })}
                                className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all active:scale-90"
                                title="Eliminar Monitor"
                              >
                                <Trash2 size={18} />
                              </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* New Monitor Modal */}
          {showMonitorModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
                <header className="px-8 py-8 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-[#2980b9] to-[#3498db] text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                      <Radio size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight">{activationKey ? 'Instalación del Agente' : 'Nuevo Nodo de Monitoreo'}</h2>
                      <p className="text-xs text-blue-100 font-medium">{activationKey ? 'Clave de activación generada' : 'Configura los parámetros de escaneo'}</p>
                    </div>
                  </div>
                  <button onClick={closeMonitorModal} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90">
                    <X size={24} />
                  </button>
                </header>

                {activationKey ? (
                  <div className="p-10 space-y-8">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-8 flex flex-col items-center text-center gap-4">
                      <div className="p-4 bg-white rounded-full shadow-sm text-emerald-500">
                        <Check size={32} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-emerald-900">¡Nodo Registrado!</p>
                        <p className="text-sm text-emerald-700/60 font-medium">Copia esta clave de seguridad para activar el agente STC en el servidor local.</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                       <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Clave de Activación Única</label>
                       <div className="relative group">
                        <input
                          readOnly
                          value={activationKey}
                          className="cd-input w-full font-mono text-sm !bg-slate-50 !py-6 !pl-6 !pr-16 border-transparent focus:!border-[#2980b9] cursor-default"
                        />
                        <button
                          onClick={copyKey}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white rounded-xl shadow-md text-[#2980b9] hover:bg-[#2980b9] hover:text-white transition-all active:scale-90"
                        >
                          {keyCopied ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
                       <Info size={20} className="text-[#2980b9] shrink-0 mt-1" />
                       <p className="text-xs text-slate-500 font-medium leading-relaxed">
                         Esta clave es confidencial y solo puede usarse una vez. Una vez activado el agente, el nodo comenzará a reportar métricas automáticamente.
                       </p>
                    </div>

                    <button
                      onClick={closeMonitorModal}
                      className="w-full py-5 rounded-[24px] bg-[#2980b9] text-white font-black hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95"
                    >
                      Entendido, Volver al Cliente
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateMonitor} className="p-10 space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Nombre Descriptivo (Sucursal/Sede) *</label>
                      <div className="relative">
                        <Layout size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          required
                          type="text"
                          className="cd-input w-full !pl-12"
                          placeholder="Ej: Sede Central - Planta Alta"
                          value={monitorForm.name}
                          onChange={e => setMonitorForm({ ...monitorForm, name: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">IP Inicial de Escaneo</label>
                        <div className="relative">
                          <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input
                            type="text"
                            className="cd-input w-full !pl-12 font-mono text-sm"
                            placeholder="192.168.1.10"
                            value={monitorForm.ipStart}
                            onChange={e => {
                              const val = e.target.value;
                              const parts = val.split('.');
                              const newIpEnd = parts.length <= 3 
                                ? val 
                                : parts.slice(0, 3).join('.') + '.';
                              setMonitorForm({ ...monitorForm, ipStart: val, ipEnd: newIpEnd });
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">IP Final de Escaneo</label>
                        <div className="relative">
                          <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input
                            type="text"
                            className="cd-input w-full !pl-12 font-mono text-sm"
                            placeholder="192.168.1.250"
                            value={monitorForm.ipEnd}
                            onFocus={e => {
                              const val = e.target.value;
                              e.target.setSelectionRange(val.length, val.length);
                            }}
                            onChange={e => setMonitorForm({ ...monitorForm, ipEnd: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                        <div className="relative">
                          <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input
                            type="text"
                            className="cd-input w-full !pl-12"
                            placeholder="public"
                            value={monitorForm.snmp_community}
                            onChange={e => setMonitorForm({ ...monitorForm, snmp_community: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Intervalo de Escaneo</label>
                        <div className="relative">
                          <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <select
                            className="cd-input w-full !pl-12"
                            value={monitorForm.scan_interval_minutes}
                            onChange={e => setMonitorForm({ ...monitorForm, scan_interval_minutes: Number(e.target.value) })}
                          >
                            <option value={15}>Cada 15 min</option>
                            <option value={30}>Cada 30 min</option>
                            <option value={60}>Cada 1 hora</option>
                            <option value={1440}>Cada 24 horas</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 flex gap-4">
                      <button
                        type="button"
                        onClick={closeMonitorModal}
                        className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-extrabold hover:bg-slate-50 transition-all active:scale-95"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={monitorSubmitting}
                        className="flex-1 py-5 rounded-[24px] bg-[#2980b9] text-white font-black hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {monitorSubmitting ? <Loader2 size={24} className="animate-spin" /> : 'Confirmar Registro'}
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
        title="Eliminar Nodo de Monitoreo"
        message={`Esta acción desactivará permanentemente el agente "${monitorToDelete?.name}". Se perderá la comunicación con todos los dispositivos asociados a este nodo.`}
        confirmText="Confirmar Eliminación"
      />
    </div>
  );
};

export default ClientDetail;
