import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  ChevronRight, HardDrive, Wifi, WifiOff, Users,
  Clock, Globe, Settings, Copy, Check, Edit, X, Plus, Trash2, Loader2, Shield, Layout, Info, Activity, MapPin
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

interface MonitorData {
  id: string;
  name: string;
  status: string;
  hardware_id: string | null;
  ip_ranges: { start: string; end: string }[] | null;
  snmp_community: string | null;
  scan_interval_minutes: number | null;
  last_seen: string | null;
  created_at: string;
  activation_key: string | null;
  client_name: string;
  client_id: string;
  active_device_count: number;
  total_device_count: number;
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const MonitorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

  // Delete Monitor modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  // Edit Configuration Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    snmp_community: 'public',
    scan_interval_minutes: 15,
    ip_ranges: [] as { start: string, end: string }[]
  });

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<MonitorData>(`/agents/${id}`),
      api.get<Device[]>(`/agents/${id}/devices`),
    ])
      .then(([m, d]) => { setMonitor(m); setDevices(d); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyKey = () => {
    if (!monitor?.activation_key) return;
    navigator.clipboard.writeText(monitor.activation_key);
    setKeyCopied(true);
    showToast('Clave de activación copiada', 'success');
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const openEditModal = () => {
    if (!monitor) return;
    setEditForm({
      name: monitor.name,
      snmp_community: monitor.snmp_community || 'public',
      scan_interval_minutes: monitor.scan_interval_minutes || 15,
      ip_ranges: monitor.ip_ranges ? [...monitor.ip_ranges] : []
    });
    setShowEditModal(true);
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.put(`/agents/${id}/config`, {
        name: editForm.name,
        snmp_community: editForm.snmp_community,
        scan_interval_minutes: editForm.scan_interval_minutes,
        ip_ranges: editForm.ip_ranges.length > 0 ? editForm.ip_ranges : null
      });
      showToast('Configuración actualizada correctamente', 'success');
      fetchData();
      setShowEditModal(false);
    } catch (err: unknown) {
      showToast('Error al actualizar: ' + (err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteMonitor = async () => {
    if (!monitor) return;
    setDeletingMonitor(true);
    try {
      await api.delete(`/agents/${id}`);
      showToast('Monitor eliminado permanentemente', 'success');
      navigate(`/clients/${monitor.client_id}`);
    } catch (err: unknown) {
      showToast('Error al eliminar monitor: ' + (err as Error).message, 'error');
    } finally {
      setDeletingMonitor(false);
      setShowDeleteModal(false);
    }
  };

  const addIpRange = () => setEditForm(prev => ({ ...prev, ip_ranges: [...prev.ip_ranges, { start: '', end: '' }] }));
  const updateIpRange = (index: number, field: 'start' | 'end', value: string) => {
    const newRanges = [...editForm.ip_ranges];
    newRanges[index][field] = value;
    setEditForm(prev => ({ ...prev, ip_ranges: newRanges }));
  };
  const removeIpRange = (index: number) => {
    setEditForm(prev => ({ ...prev, ip_ranges: prev.ip_ranges.filter((_, i) => i !== index) }));
  };

  const activeDevicesCount = devices.filter(d => d.active).length;
  const inactiveDevicesCount = devices.filter(d => !d.active).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/clients" className="flex items-center gap-2 text-slate-400 hover:text-[#2980b9] font-bold uppercase tracking-widest transition-colors">
          <Users size={14} /> Clientes
        </Link>
        <ChevronRight size={14} className="text-slate-300" />
        {monitor ? (
          <Link to={`/clients/${monitor.client_id}`} className="text-slate-400 hover:text-[#2980b9] font-bold uppercase tracking-widest transition-colors">
            {monitor.client_name}
          </Link>
        ) : (
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded-full" />
        )}
        <ChevronRight size={14} className="text-slate-300" />
        {monitor ? (
          <span className="text-[#2980b9] font-extrabold uppercase tracking-widest">{monitor.name}</span>
        ) : (
          <div className="h-4 w-32 bg-slate-100 animate-pulse rounded-full" />
        )}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-[#2980b9]" size={40} />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">Cargando expediente del monitor...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-8 text-rose-600 font-bold animate-in shake">
          {error}
        </div>
      )}

      {!loading && !error && monitor && (
        <>
          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Device Overview */}
            <div className="lg:col-span-4 space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5 group">
                <div className="bg-gradient-to-r from-[#2980b9] to-[#3498db] px-6 py-4 flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    <HardDrive size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Dispositivos Vinculados</span>
                  </div>
                  <Activity size={16} className="animate-pulse" />
                </div>
                <div className="p-8 space-y-6 text-center">
                  <Link to={`/monitors/${monitor.id}/devices`} className="block group/stat">
                    <div className="text-6xl font-black text-[#1a2333] tracking-tighter group-hover/stat:text-[#2980b9] transition-colors">
                      {monitor.total_device_count}
                    </div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-2 group-hover/stat:text-[#1a2333]">
                      Explorar Inventario Detallado
                    </div>
                  </Link>

                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                    <div className="text-center">
                      <div className="text-xl font-black text-emerald-600">{activeDevicesCount}</div>
                      <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">En Línea</div>
                    </div>
                    <div className="text-center border-l border-slate-50">
                      <div className="text-xl font-black text-rose-600">{inactiveDevicesCount}</div>
                      <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Offline</div>
                    </div>
                  </div>

                  <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
                      style={{ width: `${monitor.total_device_count > 0 ? (activeDevicesCount / monitor.total_device_count) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Status Details */}
              <div className="cd-panel p-8 space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                  <Info size={16} className="text-[#2980b9]" /> Diagnóstico del Nodo
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Estado de Red</span>
                    {monitor.status === 'active' || monitor.status === 'online' ? (
                      <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-600 uppercase">
                        <Wifi size={14} /> Sincronizado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-xs font-black text-rose-500 uppercase">
                        <WifiOff size={14} /> Desconectado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Latencia Relativa</span>
                    <span className="text-xs font-black text-[#1a2333] uppercase">{timeAgo(monitor.last_seen)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Fecha de Alta</span>
                    <span className="text-xs font-black text-[#1a2333] uppercase">{formatDate(monitor.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Hardware ID</span>
                    <span className="text-[10px] font-black text-slate-400 font-mono tracking-tighter uppercase">{monitor.hardware_id || 'SIN VINCULAR'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Configuration & Ranges */}
            <div className="lg:col-span-8 space-y-6">
              <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5">
                <div className="bg-[#1a2333] px-8 py-6 flex items-center justify-between text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl">
                      <Settings size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black tracking-tight uppercase">Parámetros Operativos</h2>
                      <p className="text-[10px] font-bold text-blue-300/60 uppercase tracking-widest">Configuración de escaneo y SNMP</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={openEditModal}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-90"
                      title="Modificar Configuración"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="p-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-2xl transition-all active:scale-90"
                      title="Dar de Baja Nodo"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comunidad SNMP Activa</label>
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-[20px] border border-slate-100">
                        <Shield size={16} className="text-[#2980b9]" />
                        <span className="font-mono text-sm font-bold text-[#1a2333]">{monitor.snmp_community || 'public'}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frecuencia de Muestreo</label>
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-[20px] border border-slate-100">
                        <Clock size={16} className="text-[#2980b9]" />
                        <span className="text-sm font-black text-[#1a2333] uppercase">CADA {monitor.scan_interval_minutes || 15} MINUTOS</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Segmentos de Red (IP Ranges)</label>
                    <div className="space-y-3">
                      {monitor.ip_ranges && monitor.ip_ranges.length > 0 ? (
                        monitor.ip_ranges.map((r, i) => (
                          <div key={i} className="flex items-center gap-4 p-4 bg-blue-50/30 rounded-[20px] border border-blue-100/50 group hover:bg-blue-50 transition-colors">
                            <div className="p-2 bg-white rounded-xl shadow-sm text-[#2980b9]">
                              <Globe size={14} />
                            </div>
                            <div className="flex-1">
                              <div className="text-[10px] font-black text-[#2980b9] uppercase tracking-tighter">Segmento {i + 1}</div>
                              <div className="font-mono text-xs font-bold text-[#1a2333]">{r.start} — {r.end}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 bg-slate-50 rounded-[24px] border border-dashed border-slate-200">
                           <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Sin rangos definidos</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {monitor.activation_key && (
                  <div className="mx-10 mb-10 p-6 bg-emerald-50 border border-emerald-100 rounded-[24px] flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white rounded-2xl shadow-sm text-emerald-600">
                        <Shield size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Token de Seguridad de la Sesión</p>
                        <p className="font-mono text-xs font-bold text-emerald-900 truncate max-w-[200px] sm:max-w-md">{monitor.activation_key}</p>
                      </div>
                    </div>
                    <button 
                      onClick={copyKey} 
                      className="p-4 bg-white text-emerald-600 rounded-2xl shadow-md hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                    >
                      {keyCopied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Edit Modal */}
          {showEditModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/60 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <header className="px-8 py-8 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-[#2980b9] to-[#3498db] text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                      <Settings size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight uppercase">Configurar Nodo</h2>
                      <p className="text-xs text-blue-100 font-medium">Ajusta los parámetros operativos del agente</p>
                    </div>
                  </div>
                  <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-90">
                    <X size={24} />
                  </button>
                </header>

                <form onSubmit={handleUpdateConfig} className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  <div className="space-y-3">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Identificador del Nodo *</label>
                    <div className="relative">
                      <Layout size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input
                        required
                        type="text"
                        className="cd-input w-full !pl-12"
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                      <div className="relative">
                        <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          type="text"
                          required
                          className="cd-input w-full !pl-12 font-mono text-sm"
                          value={editForm.snmp_community}
                          onChange={(e) => setEditForm(prev => ({ ...prev, snmp_community: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Intervalo de Escaneo</label>
                      <div className="relative">
                        <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                        <select
                          className="cd-input w-full !pl-12"
                          value={editForm.scan_interval_minutes}
                          onChange={(e) => setEditForm(prev => ({ ...prev, scan_interval_minutes: Number(e.target.value) }))}
                        >
                          <option value={15}>Cada 15 min</option>
                          <option value={30}>Cada 30 min</option>
                          <option value={60}>Cada 1 hora</option>
                          <option value={1440}>Cada 24 horas</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Segmentación IP (Whitelist)</label>
                      <button
                        type="button"
                        onClick={addIpRange}
                        className="flex items-center gap-2 text-[10px] font-black text-[#2980b9] uppercase tracking-widest hover:text-[#2471a3] transition-colors"
                      >
                        <Plus size={14} /> Agregar Rango
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {editForm.ip_ranges.map((range, idx) => (
                        <div key={idx} className="flex gap-4 items-center bg-slate-50 p-4 rounded-[24px] border border-slate-100 group animate-in slide-in-from-right-4 duration-300">
                          <div className="relative flex-1">
                            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                              type="text"
                              required
                              placeholder="IP Inicio"
                              className="cd-input w-full !pl-10 !bg-white font-mono text-xs"
                              value={range.start}
                              onChange={(e) => updateIpRange(idx, 'start', e.target.value)}
                            />
                          </div>
                          <div className="relative flex-1">
                            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                              type="text"
                              required
                              placeholder="IP Fin"
                              className="cd-input w-full !pl-10 !bg-white font-mono text-xs"
                              value={range.end}
                              onChange={(e) => updateIpRange(idx, 'end', e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeIpRange(idx)}
                            className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 flex gap-4">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-extrabold hover:bg-slate-50 transition-all active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-5 rounded-[24px] bg-[#2980b9] text-white font-black hover:bg-[#2471a3] transition-all shadow-xl shadow-blue-900/10 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : 'Sincronizar Cambios'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <ConfirmModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={confirmDeleteMonitor}
            isLoading={deletingMonitor}
            isDanger
            title="Dar de Baja Nodo de Monitoreo"
            message={`¿Estás seguro de que deseas eliminar permanentemente el nodo "${monitor?.name}"? Esta acción desactivará el agente STC en el servidor del cliente y borrará todo el historial de dispositivos asociados.`}
            confirmText="Baja Permanente"
          />
        </>
      )}
    </div>
  );
};

export default MonitorDetail;
