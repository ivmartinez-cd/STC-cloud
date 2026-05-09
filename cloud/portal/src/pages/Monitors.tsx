import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, ShieldCheck, ShieldOff, RefreshCw, X, Settings, Trash2, Radio, Server, Activity, ChevronRight, Loader2, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

interface Monitor {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked';
  last_seen: string | null;
  client_id: string;
}

interface IpRange {
  start: string;
  end: string;
}

interface MonitorConfig {
  ip_ranges: IpRange[];
  snmp_community: string;
  scan_interval_minutes: number;
}

interface Client { id: string; name: string }

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Nunca';
  const lastSeenDate = new Date(ts);
  const diffMs = Date.now() - lastSeenDate.getTime();
  const min = Math.floor(diffMs / 60000);
  
  if (min < 2)  return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.floor(min / 60)} horas`;
  return lastSeenDate.toLocaleDateString();
}

const emptyRange = (): IpRange => ({ start: '', end: '' });

const defaultConfig: MonitorConfig = {
  ip_ranges: [],
  snmp_community: 'public',
  scan_interval_minutes: 15,
};

const Monitors = () => {
  const [monitors, setMonitors]           = useState<Monitor[]>([]);
  const [clients, setClients]             = useState<Client[]>([]);
  const [loading, setLoading]             = useState(true);
  const [revoking, setRevoking]           = useState<string | null>(null);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const [creating, setCreating]           = useState(false);
  const { showToast } = useToast();

  const [formClientId, setFormClientId]   = useState('');
  const [formName, setFormName]           = useState('');
  const [formRanges, setFormRanges]       = useState<IpRange[]>([emptyRange()]);
  const [formSnmp, setFormSnmp]           = useState('public');
  const [formInterval, setFormInterval]   = useState(15);

  const [configModal, setConfigModal]     = useState<{ id: string; name: string } | null>(null);
  const [configForm, setConfigForm]       = useState<MonitorConfig>(defaultConfig);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig]   = useState(false);

  // Delete Monitor modal
  const [monitorToDelete, setMonitorToDelete] = useState<{ id: string, name: string } | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  const loadMonitors = useCallback(async (isRefresh = false) => {
    if (isRefresh) showToast('Actualizando datos...', 'info');
    try {
      const data = await api.get<Monitor[]>('/agents');
      setMonitors(data);
      if (isRefresh) showToast('Lista de monitores actualizada', 'success');
    } catch (e: any) {
      showToast('Error al cargar monitores: ' + e.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    Promise.all([
      api.get<Monitor[]>('/agents').then(setMonitors),
      api.get<Client[]>('/clients').then(setClients),
    ])
    .catch(e => showToast('Error inicial: ' + e.message, 'error'))
    .finally(() => setLoading(false));
  }, [showToast]);

  const resetForm = () => {
    setFormClientId('');
    setFormName('');
    setFormRanges([emptyRange()]);
    setFormSnmp('public');
    setFormInterval(15);
  };

  const updateFormRange = (idx: number, field: 'start' | 'end', value: string) =>
    setFormRanges(rs => rs.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // Auto-fill end IP prefix if start is being updated
      if (field === 'start') {
        const lastDot = value.lastIndexOf('.');
        if (lastDot !== -1) {
          const prefix = value.substring(0, lastDot + 1);
          if (!r.end || r.end === prefix.substring(0, prefix.length - 1)) {
            updated.end = prefix;
          }
        }
      }
      return updated;
    }));

  const generateKey = async () => {
    if (!formClientId || !formName.trim()) return;
    for (const r of formRanges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Completa todas las IPs de inicio y fin.', 'warning');
        return;
      }
    }
    setCreating(true);
    try {
      const data = await api.post<{ key: string }>('/agents', {
        clientId: formClientId,
        name: formName.trim(),
        ip_ranges: formRanges.filter(r => r.start.trim() && r.end.trim()),
        snmp_community: formSnmp.trim() || 'public',
        scan_interval_minutes: formInterval,
      });
      setActivationKey(data.key);
      setShowForm(false);
      resetForm();
      showToast('Monitor registrado exitosamente', 'success');
      await loadMonitors();
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const revokeMonitor = async (id: string) => {
    setRevoking(id);
    try {
      await api.post(`/agents/${id}/revoke`, {});
      showToast('Acceso revocado correctamente', 'success');
      await loadMonitors();
    } catch (e: any) {
      showToast('Error al revocar: ' + e.message, 'error');
    } finally {
      setRevoking(null);
    }
  };

  const confirmDeleteMonitor = async () => {
    if (!monitorToDelete) return;
    setDeletingMonitor(true);
    try {
      await api.delete(`/agents/${monitorToDelete.id}`);
      setMonitorToDelete(null);
      showToast('Monitor eliminado permanentemente', 'success');
      await loadMonitors();
    } catch (e: any) {
      showToast('Error al eliminar: ' + e.message, 'error');
    } finally {
      setDeletingMonitor(false);
    }
  };

  const openConfigModal = async (monitor: Monitor) => {
    setConfigModal({ id: monitor.id, name: monitor.name });
    setLoadingConfig(true);
    try {
      const data = await api.get<MonitorConfig>(`/agents/${monitor.id}/config`);
      setConfigForm({
        ip_ranges: data?.ip_ranges ?? [],
        snmp_community: data?.snmp_community ?? 'public',
        scan_interval_minutes: data?.scan_interval_minutes ?? 15,
      });
    } catch {
      showToast('No se pudo cargar la configuración remota', 'warning');
      setConfigForm(defaultConfig);
    } finally {
      setLoadingConfig(false);
    }
  };

  const closeConfigModal = () => {
    setConfigModal(null);
    setConfigForm(defaultConfig);
  };

  const saveConfig = async () => {
    if (!configModal) return;
    for (const r of configForm.ip_ranges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Todos los rangos deben tener IP de inicio y fin.', 'warning');
        return;
      }
    }
    setSavingConfig(true);
    try {
      await api.put(`/agents/${configModal.id}/config`, {
        ip_ranges: configForm.ip_ranges,
        snmp_community: configForm.snmp_community,
        scan_interval_minutes: configForm.scan_interval_minutes,
      });
      showToast('Configuración actualizada correctamente', 'success');
      closeConfigModal();
    } catch (e: any) {
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1a2333] tracking-tight">Monitores</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Gestión de agentes de red y sucursales conectadas
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => loadMonitors(true)}
            className="p-3 text-slate-400 hover:text-[#2980b9] hover:bg-white rounded-xl transition-all shadow-sm border border-slate-100"
            title="Actualizar"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => { setShowForm(f => !f); setActivationKey(null); if (showForm) resetForm(); }}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 ${
              showForm 
                ? 'bg-slate-100 text-slate-600 border border-slate-200' 
                : 'bg-[#e67e22] text-white shadow-orange-900/20 hover:bg-[#d35400]'
            }`}
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? 'Cancelar Registro' : 'Nuevo Monitor'}
          </button>
        </div>
      </header>

      {/* Create form */}
      {showForm && (
        <div className="cd-panel border-none shadow-xl bg-gradient-to-br from-white to-slate-50 overflow-hidden ring-1 ring-slate-100 animate-in slide-in-from-top-4 duration-300">
          <div className="bg-[#2980b9] p-4 flex items-center gap-3 text-white">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Radio size={18} />
            </div>
            <h3 className="font-extrabold text-sm uppercase tracking-wider">Registro de Nuevo Agente</h3>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Cliente Asociado *</label>
                <select
                  value={formClientId}
                  onChange={e => setFormClientId(e.target.value)}
                  className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-[#2980b9]"
                >
                  <option value="">Seleccionar empresa...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Etiqueta del Monitor *</label>
                <input
                  type="text"
                  placeholder="Ej: Sucursal Centro / Depósito A"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-[#2980b9]"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Segmentos de Red (IP Ranges)</label>
                <button
                  onClick={() => setFormRanges(rs => [...rs, emptyRange()])}
                  className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#2980b9] uppercase hover:opacity-70 transition-opacity"
                >
                  <Plus size={14} /> Agregar otro rango
                </button>
              </div>
              <div className="space-y-3">
                {formRanges.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-left-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="IP Inicio"
                        value={r.start}
                        onChange={e => updateFormRange(idx, 'start', e.target.value)}
                        className="cd-input w-full !h-11 !bg-white border-slate-200 focus:border-[#2980b9] font-mono text-xs"
                      />
                    </div>
                    <div className="h-px w-4 bg-slate-200 shrink-0" />
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="IP Fin"
                        value={r.end}
                        onChange={e => updateFormRange(idx, 'end', e.target.value)}
                        className="cd-input w-full !h-11 !bg-white border-slate-200 focus:border-[#2980b9] font-mono text-xs"
                      />
                    </div>
                    {formRanges.length > 1 && (
                      <button 
                        onClick={() => setFormRanges(rs => rs.filter((_, i) => i !== idx))}
                        className="shrink-0 p-2 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                <input 
                  type="text" 
                  value={formSnmp} 
                  onChange={e => setFormSnmp(e.target.value)}
                  className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-[#2980b9] font-mono text-xs" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Intervalo de Escaneo (Minutos)</label>
                <input 
                  type="number" 
                  min={1} 
                  max={1440} 
                  value={formInterval} 
                  onChange={e => setFormInterval(Number(e.target.value))}
                  className="cd-input w-full !h-12 !bg-white border-slate-200 focus:border-[#2980b9]" 
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                onClick={generateKey} 
                disabled={!formClientId || !formName.trim() || creating}
                className="bg-[#2980b9] hover:bg-[#2c3e50] disabled:opacity-40 text-white rounded-xl py-3 px-8 text-sm font-extrabold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />}
                {creating ? 'Generando...' : 'Generar Llave de Activación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation key display */}
      {activationKey && (
        <div className="cd-panel border-none bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-100 overflow-hidden animate-in zoom-in-95">
          <div className="flex flex-col md:flex-row items-center gap-6 p-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-500/20">
              <Key size={32} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-extrabold tracking-tight">¡Llave Generada con Éxito!</h3>
              <p className="text-sm font-medium text-emerald-700/80 mt-1">Válida por 24 horas. Copie y ejecute el comando en el servidor local:</p>
              
              <div className="mt-4 p-4 bg-white/60 border border-emerald-200 rounded-xl font-mono text-xs break-all select-all flex items-center justify-between gap-4">
                <span className="text-emerald-800">ContadorImpresoras.exe --activate <span className="font-bold underline">{activationKey}</span> --server {window.location.origin}</span>
                <Info size={16} className="text-emerald-400 shrink-0" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="cd-panel border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-[#1a2333] tracking-tight">Monitores Registrados</h3>
          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
            {monitors.length} Total
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 size={32} className="animate-spin text-[#2980b9]" />
            <span className="text-sm font-bold uppercase tracking-widest opacity-50">Sincronizando agentes...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm cd-table border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-[0.15em]">
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Nombre / Sucursal</th>
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Hardware ID</th>
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Última Conexión</th>
                  <th className="px-6 py-4 text-left font-bold border-b border-slate-100">Estado</th>
                  <th className="px-6 py-4 text-right font-bold border-b border-slate-100">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monitors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3 opacity-30">
                        <Server size={48} />
                        <p className="font-bold uppercase tracking-widest text-xs">No hay monitores activos</p>
                      </div>
                    </td>
                  </tr>
                )}
                {monitors.map(monitor => (
                  <tr key={monitor.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          monitor.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <Radio size={14} />
                        </div>
                        <span className="font-bold text-[#1a2333]">{monitor.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">
                        {monitor.hardware_id || 'SIN_VINCULAR'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Activity size={12} className="opacity-40" />
                        <span className="text-xs font-medium">{formatLastSeen(monitor.last_seen)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {monitor.status === 'active' && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          <ShieldCheck size={12} /> Operativo
                        </span>
                      )}
                      {monitor.status === 'revoked' && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                          <ShieldOff size={12} /> Revocado
                        </span>
                      )}
                      {monitor.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                          <RefreshCw size={12} className="animate-spin-slow" /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {monitor.status !== 'revoked' && (
                          <button 
                            onClick={() => openConfigModal(monitor)}
                            className="p-2 text-[#2980b9] hover:bg-[#2980b9] hover:text-white rounded-lg transition-all"
                            title="Configurar"
                          >
                            <Settings size={16} />
                          </button>
                        )}
                        {monitor.status === 'active' && (
                          <button 
                            onClick={() => revokeMonitor(monitor.id)} 
                            disabled={revoking === monitor.id}
                            className="p-2 text-orange-500 hover:bg-orange-500 hover:text-white rounded-lg transition-all"
                            title="Revocar acceso"
                          >
                            {revoking === monitor.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
                          </button>
                        )}
                        <button 
                          onClick={() => setMonitorToDelete({ id: monitor.id, name: monitor.name })}
                          className="p-2 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                          title="Eliminar permanentemente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config modal */}
      {configModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#2c3e50] to-[#1a2333] text-white">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Configuración Remota</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1">{configModal.name}</p>
              </div>
              <button onClick={closeConfigModal} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </header>

            {loadingConfig ? (
              <div className="p-20 text-center flex flex-col items-center gap-4">
                <Loader2 size={32} className="animate-spin text-[#2980b9]" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Obteniendo parámetros...</p>
              </div>
            ) : (
              <div className="p-8 space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Rangos de Red Activos</label>
                    <button 
                      onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                      className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#2980b9] uppercase"
                    >
                      <Plus size={14} /> Nuevo Rango
                    </button>
                  </div>
                  
                  {configForm.ip_ranges.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-xs text-slate-400 font-medium">No hay rangos definidos. El monitor no realizará escaneos.</p>
                    </div>
                  )}

                  <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                    {configForm.ip_ranges.map((range, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <input 
                          type="text" 
                          placeholder="IP Inicio" 
                          value={range.start}
                          onChange={e => {
                            const val = e.target.value;
                            setConfigForm(f => ({
                              ...f,
                              ip_ranges: f.ip_ranges.map((r, i) => {
                                if (i !== idx) return r;
                                return { ...r, start: val };
                              })
                            }));
                          }}
                          className="cd-input flex-1 !h-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] font-mono text-xs" 
                        />
                        <div className="h-px w-4 bg-slate-200" />
                        <input 
                          type="text" 
                          placeholder="IP Fin" 
                          value={range.end}
                          onChange={e => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.map((r, i) => i === idx ? { ...r, end: e.target.value } : r) }))}
                          className="cd-input flex-1 !h-11 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] font-mono text-xs" 
                        />
                        <button 
                          onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                    <input 
                      type="text" 
                      value={configForm.snmp_community}
                      onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                      className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] font-mono text-xs" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest ml-1">Frecuencia (min)</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={1440} 
                      value={configForm.scan_interval_minutes}
                      onChange={e => setConfigForm(f => ({ ...f, scan_interval_minutes: Number(e.target.value) }))}
                      className="cd-input w-full !h-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]" 
                    />
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start gap-3">
                  <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-amber-800 font-bold uppercase tracking-tight leading-relaxed">
                    Nota: Los cambios se enviarán al monitor y se aplicarán en su próximo ciclo de actualización (máx. 60s).
                  </p>
                </div>

                <div className="flex justify-end gap-4 pt-2">
                  <button 
                    onClick={closeConfigModal} 
                    className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Descartar
                  </button>
                  <button 
                    onClick={saveConfig} 
                    disabled={savingConfig}
                    className="px-8 py-3 bg-[#e67e22] hover:bg-[#d35400] disabled:opacity-40 text-white text-sm font-extrabold rounded-xl transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2"
                  >
                    {savingConfig ? <Loader2 size={18} className="animate-spin" /> : 'Aplicar Cambios'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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

export default Monitors;

