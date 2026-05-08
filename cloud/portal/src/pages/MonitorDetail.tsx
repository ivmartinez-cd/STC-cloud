import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Users, ChevronRight, HardDrive, Wifi, WifiOff,
  Server, Clock, Globe, Settings, Copy, Check, Edit, X, Plus, Trash2, Loader2
} from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

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
    snmp_community: 'public',
    scan_interval_minutes: 15,
    ip_ranges: [] as { start: string, end: string }[]
  });

  useEffect(() => {
    Promise.all([
      api.get<MonitorData>(`/agents/${id}`),
      api.get<Device[]>(`/agents/${id}/devices`),
    ])
      .then(([m, d]) => { setMonitor(m); setDevices(d); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const copyKey = () => {
    if (!monitor?.activation_key) return;
    navigator.clipboard.writeText(monitor.activation_key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const openEditModal = () => {
    if (!monitor) return;
    setEditForm({
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
        snmp_community: editForm.snmp_community,
        scan_interval_minutes: editForm.scan_interval_minutes,
        ip_ranges: editForm.ip_ranges.length > 0 ? editForm.ip_ranges : null
      });
      const m = await api.get<MonitorData>(`/agents/${id}`);
      setMonitor(m);
      setShowEditModal(false);
    } catch (err: any) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteMonitor = async () => {
    if (!monitor) return;
    setDeletingMonitor(true);
    try {
      await api.delete(`/agents/${id}`);
      navigate(`/clients/${monitor.client_id}`);
    } catch (err: any) {
      alert('Error al eliminar monitor: ' + err.message);
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

  const activeDevices = devices.filter(d => d.active);
  const inactiveDevices = devices.filter(d => !d.active);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
        <Link to="/clients" className="flex items-center gap-1 hover:text-[#2980b9] transition-colors">
          <Users size={12} /> Clientes
        </Link>
        <ChevronRight size={12} className="text-slate-300" />
        {monitor ? (
          <Link to={`/clients/${monitor.client_id}`} className="hover:text-[#2980b9] transition-colors">
            {monitor.client_name}
          </Link>
        ) : (
          <span className="text-slate-300">…</span>
        )}
        <ChevronRight size={12} className="text-slate-300" />
        {monitor ? (
          <span className="text-[#1a2333] font-medium">{monitor.name}</span>
        ) : (
          <span className="text-slate-300">Cargando…</span>
        )}
      </nav>

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Cargando monitor…</div>}
      {error && <div className="text-center py-16 text-red-500 text-sm">{error}</div>}

      {!loading && !error && monitor && (
        <>
          {/* 3-panel header */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Left — Device summary (clickable) */}
            <div className="cd-panel rounded-xl overflow-hidden">
              <div className="bg-[#2980b9] text-white px-5 py-3 flex items-center gap-2">
                <HardDrive size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Dispositivos</span>
              </div>
              <div className="p-5 space-y-3">
                <Link
                  to={`/monitors/${monitor.id}/devices`}
                  className="block w-full text-center group cursor-pointer"
                >
                  <div className="text-4xl font-bold text-[#2980b9] group-hover:text-[#f39c12] transition-colors">
                    {monitor.total_device_count}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 group-hover:text-[#1a2333] transition-colors">
                    Click para ver detalle
                  </div>
                </Link>

                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#689f38]" />
                      <span className="text-xs text-slate-500">Activos</span>
                    </div>
                    <span className="font-bold text-sm text-[#1a2333]">{activeDevices.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="text-xs text-slate-500">Inactivos</span>
                    </div>
                    <span className="font-bold text-sm text-[#1a2333]">{inactiveDevices.length}</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#689f38] rounded-full transition-all"
                    style={{ width: `${monitor.total_device_count > 0 ? (activeDevices.length / monitor.total_device_count) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Center — Monitor status */}
            <div className="cd-panel rounded-xl overflow-hidden">
              <div className="bg-[#2980b9] text-white px-5 py-3 flex items-center gap-2">
                <Server size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">Estado del Monitor</span>
              </div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Estado</td>
                      <td className="py-2 font-medium text-[#1a2333]">
                        {monitor.status === 'active' || monitor.status === 'online' ? (
                          <span className="inline-flex items-center gap-1.5 text-[#689f38]">
                            <Wifi size={12} /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-400">
                            <WifiOff size={12} /> {monitor.status}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Presencia</td>
                      <td className="py-2 font-medium">
                        {(() => {
                          const isOnline = monitor.last_seen && (Date.now() - new Date(monitor.last_seen).getTime()) < 300000;
                          return (
                            <span className={`inline-flex items-center gap-1.5 ${isOnline ? 'text-[#689f38]' : 'text-red-500'}`}>
                              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#689f38]' : 'bg-red-500'}`} />
                              {isOnline ? 'En línea' : 'Fuera de línea'}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Última actividad</td>
                      <td className="py-2 text-[#1a2333]">{timeAgo(monitor.last_seen)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Creado</td>
                      <td className="py-2 text-[#1a2333]">{formatDate(monitor.created_at)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Hardware ID</td>
                      <td className="py-2 text-[#1a2333] font-mono text-xs">{monitor.hardware_id || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right — Configuration */}
            <div className="cd-panel rounded-xl overflow-hidden">
              <div className="bg-[#2980b9] text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">Configuración</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={openEditModal}
                    className="p-1 hover:bg-white/20 rounded transition-colors text-white"
                    title="Editar Configuracion"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="p-1 hover:bg-white/20 rounded transition-colors text-white"
                    title="Eliminar Monitor"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Comunidad SNMP</td>
                      <td className="py-2 font-medium text-[#1a2333] font-mono text-xs">{monitor.snmp_community || 'public'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Intervalo de escaneo</td>
                      <td className="py-2 text-[#1a2333]">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          {monitor.scan_interval_minutes || 15} min
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-500 pr-4">Rangos IP</td>
                      <td className="py-2">
                        {monitor.ip_ranges && monitor.ip_ranges.length > 0 ? (
                          <div className="space-y-1">
                            {monitor.ip_ranges.map((r, i) => (
                              <div key={i} className="font-mono text-xs text-[#1a2333] bg-slate-50 px-2 py-1 rounded inline-flex items-center gap-1 mr-1">
                                <Globe size={10} className="text-slate-400" />
                                {r.start} — {r.end}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No configurados</span>
                        )}
                      </td>
                    </tr>
                    {monitor.activation_key && (
                      <tr>
                        <td className="py-2 text-slate-500 pr-4">Clave de activación</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-slate-400 truncate max-w-[120px]">
                              {monitor.activation_key.slice(0, 16)}…
                            </span>
                            <button onClick={copyKey} className="p-1 rounded hover:bg-slate-100 transition-colors" title="Copiar">
                              {keyCopied ? <Check size={12} className="text-[#689f38]" /> : <Copy size={12} className="text-slate-400" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Configuration Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#2980b9] text-white">
              <h2 className="font-bold">Editar Configuración</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </header>
            <form onSubmit={handleUpdateConfig} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comunidad SNMP</label>
                  <input
                    type="text"
                    required
                    className="cd-input w-full font-mono text-xs"
                    value={editForm.snmp_community}
                    onChange={(e) => setEditForm(prev => ({ ...prev, snmp_community: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Intervalo (min)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    className="cd-input w-full"
                    value={editForm.scan_interval_minutes}
                    onChange={(e) => setEditForm(prev => ({ ...prev, scan_interval_minutes: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rangos IP para escaneo</label>
                  <button
                    type="button"
                    onClick={addIpRange}
                    className="flex items-center gap-1 text-xs font-semibold text-[#2980b9] hover:text-[#2471a3] transition-colors"
                  >
                    <Plus size={14} /> Agregar Rango
                  </button>
                </div>
                {editForm.ip_ranges.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-400">
                    No hay rangos IP configurados. El agente no escaneará dispositivos automáticamente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editForm.ip_ranges.map((range, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <input
                          type="text"
                          required
                          placeholder="IP Inicio (ej: 192.168.1.1)"
                          className="cd-input flex-1 font-mono text-xs"
                          value={range.start}
                          onChange={(e) => updateIpRange(idx, 'start', e.target.value)}
                        />
                        <input
                          type="text"
                          required
                          placeholder="IP Fin (ej: 192.168.1.254)"
                          className="cd-input flex-1 font-mono text-xs"
                          value={range.end}
                          onChange={(e) => updateIpRange(idx, 'end', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeIpRange(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar rango"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-[#2980b9] text-white font-bold hover:bg-[#2471a3] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteMonitor}
        isLoading={deletingMonitor}
        isDanger
        title="Eliminar Monitor"
        message={`¿Estás seguro de que deseas eliminar el monitor "${monitor?.name}"? Esta acción borrará también todos sus dispositivos y lecturas de forma permanente.`}
        confirmText="Eliminar"
      />
    </div>
  );
};

export default MonitorDetail;
