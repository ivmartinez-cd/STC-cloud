import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, ShieldCheck, ShieldOff, RefreshCw, X, Settings, Trash2, Cpu, Activity, Clock, Globe, Copy, Check, Server, Search, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

interface Agent {
  id: string;
  name: string;
  hardware_id: string | null;
  status: 'pending' | 'active' | 'revoked';
  last_seen: string | null;
  client_id: string;
  client_name?: string;
}

interface IpRange {
  start: string;
  end: string;
}

interface AgentConfig {
  ip_ranges: IpRange[];
  snmp_community: string;
  scan_interval_minutes: number;
}

interface Client { id: string; name: string }

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Nunca';
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 2)  return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return new Date(ts).toLocaleString();
}

const emptyRange = (): IpRange => ({ start: '', end: '' });

const defaultConfig: AgentConfig = {
  ip_ranges: [],
  snmp_community: 'public',
  scan_interval_minutes: 15,
};

const Agents = () => {
  const { showToast } = useToast();
  const [agents, setAgents]               = useState<Agent[]>([]);
  const [clients, setClients]             = useState<Client[]>([]);
  const [loading, setLoading]             = useState(true);
  const [revoking, setRevoking]           = useState<string | null>(null);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const [creating, setCreating]           = useState(false);
  const [searchTerm, setSearchTerm]       = useState('');

  // Form: create agent
  const [formClientId, setFormClientId]         = useState('');
  const [formName, setFormName]                 = useState('');
  const [formRanges, setFormRanges]             = useState<IpRange[]>([emptyRange()]);
  const [formSnmp, setFormSnmp]                 = useState('public');
  const [formInterval, setFormInterval]         = useState(15);

  // Config modal
  const [configModal, setConfigModal]     = useState<{ id: string; name: string } | null>(null);
  const [configForm, setConfigForm]       = useState<AgentConfig>(defaultConfig);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig]   = useState(false);

  // Revoke modal state
  const [agentToRevoke, setAgentToRevoke] = useState<Agent | null>(null);

  // Regenerate key modal
  const [regenModal, setRegenModal] = useState<{ agentName: string; key: string; expiresAt: string } | null>(null);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      const data = await api.get<Agent[]>('/agents');
      setAgents(data);
    } catch {
      showToast('Error al cargar agentes', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    Promise.all([
      api.get<Agent[]>('/agents').then(data => setAgents(Array.isArray(data) ? data : [])),
      api.get<Client[]>('/clients').then(data => setClients(Array.isArray(data) ? data : [])),
    ]).catch(() => {
      showToast('Error de conexión con el servidor', 'error');
    }).finally(() => setLoading(false));
  }, [showToast]);

  // ── Form helpers ──────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormClientId('');
    setFormName('');
    setFormRanges([emptyRange()]);
    setFormSnmp('public');
    setFormInterval(15);
  };

  const updateFormRange = (idx: number, field: 'start' | 'end', value: string) =>
    setFormRanges(rs => rs.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const addFormRange = () => setFormRanges(rs => [...rs, emptyRange()]);

  const removeFormRange = (idx: number) =>
    setFormRanges(rs => rs.filter((_, i) => i !== idx));

  // ── Actions ──────────────────────────────────────────────────────────────────

  const generateKey = async () => {
    if (!formClientId || !formName.trim()) return;
    for (const r of formRanges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Completa todas las IPs del rango', 'warning');
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
      showToast('Llave de activación generada con éxito', 'success');
      await loadAgents();
    } catch (e: unknown) {
      showToast('Error: ' + (e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const revokeAgent = async () => {
    if (!agentToRevoke) return;
    const id = agentToRevoke.id;
    setRevoking(id);
    try {
      await api.post(`/agents/${id}/revoke`, {});
      showToast('Agente revocado correctamente', 'success');
      setAgentToRevoke(null);
      await loadAgents();
    } catch (e: unknown) {
      showToast('Error al revocar: ' + (e as Error).message, 'error');
    } finally {
      setRevoking(null);
    }
  };

  const regenerateKey = async (agent: Agent) => {
    setRegenLoading(agent.id);
    try {
      const data = await api.post<{ key: string; expiresAt: string }>(`/agents/${agent.id}/regenerate-key`, {});
      setRegenModal({ agentName: agent.name, key: data.key, expiresAt: data.expiresAt });
      setKeyCopied(false);
      showToast('Nueva llave generada — válida por 24 h', 'success');
      await loadAgents();
    } catch (e: unknown) {
      showToast('Error al regenerar: ' + (e as Error).message, 'error');
    } finally {
      setRegenLoading(null);
    }
  };

  const openConfigModal = async (agent: Agent) => {
    setConfigModal({ id: agent.id, name: agent.name });
    setLoadingConfig(true);
    try {
      const data = await api.get<AgentConfig>(`/agents/${agent.id}/config`);
      setConfigForm({
        ip_ranges: data?.ip_ranges ?? [],
        snmp_community: data?.snmp_community ?? 'public',
        scan_interval_minutes: data?.scan_interval_minutes ?? 15,
      });
    } catch {
      setConfigForm(defaultConfig);
    } finally {
      setLoadingConfig(false);
    }
  };

  const closeConfigModal = () => {
    setConfigModal(null);
    setConfigForm(defaultConfig);
  };

  const updateConfigRange = (idx: number, field: 'start' | 'end', value: string) =>
    setConfigForm(f => ({
      ...f,
      ip_ranges: f.ip_ranges.map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }));

  const saveConfig = async () => {
    if (!configModal) return;
    for (const r of configForm.ip_ranges) {
      if (!r.start.trim() || !r.end.trim()) {
        showToast('Todos los rangos deben tener IP de inicio y fin', 'warning');
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
      showToast('Configuración remota actualizada', 'success');
      closeConfigModal();
    } catch (e: unknown) {
      showToast('Error al guardar: ' + (e as Error).message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.hardware_id?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-[#1a2333] tracking-tight">Ecosistema de Agentes</h1>
          <p className="text-slate-400 mt-1 font-bold uppercase tracking-widest text-[10px]">Servicios de recolección de datos distribuidos</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadAgents}
            className="p-4 bg-white border border-slate-100 text-slate-400 hover:text-[#2980b9] rounded-2xl transition-all shadow-sm active:scale-95"
            title="Sincronizar Lista"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setShowForm(f => !f); setActivationKey(null); if (showForm) resetForm(); }}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 shadow-xl ${
              showForm 
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-slate-200/20' 
                : 'bg-gradient-to-r from-[#2980b9] to-[#3498db] text-white hover:shadow-blue-900/30'
            }`}
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            {showForm ? 'CANCELAR' : 'DESPLEGAR NUEVO'}
          </button>
        </div>
      </header>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="cd-panel overflow-hidden animate-in slide-in-from-top-4 duration-500 border-none shadow-2xl shadow-blue-900/5">
          <div className="bg-[#1a2333] px-10 py-6 flex items-center gap-4 text-white">
            <div className="p-3 bg-white/10 rounded-2xl">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Configuración de Despliegue</h3>
              <p className="text-[10px] font-bold text-blue-300/60 uppercase tracking-widest">Defina los parámetros del nuevo nodo de monitoreo</p>
            </div>
          </div>

          <div className="p-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vincular a Cliente *</label>
                <div className="relative">
                  <Server size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <select
                    value={formClientId}
                    onChange={e => setFormClientId(e.target.value)}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                  >
                    <option value="">Seleccionar cliente destino...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Etiqueta de Identificación</label>
                <div className="relative">
                  <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    placeholder="Ej: Servidor de Monitoreo Central"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                  />
                </div>
              </div>
            </div>

            {/* Rangos IP */}
            <div className="bg-slate-50/50 rounded-[32px] p-8 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Segmentos de Red Permitidos</label>
                <button
                  onClick={addFormRange}
                  className="flex items-center gap-2 text-[10px] font-black text-[#2980b9] hover:text-[#2471a3] uppercase tracking-widest transition-colors"
                >
                  <Plus size={14} /> AGREGAR RANGO
                </button>
              </div>
              <div className="space-y-4">
                {formRanges.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-right-4">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="IP Inicio"
                        value={r.start}
                        onChange={e => updateFormRange(idx, 'start', e.target.value)}
                        className="cd-input w-full !h-14 !text-xs font-mono !bg-white border-slate-200"
                      />
                    </div>
                    <div className="text-slate-300 font-black">—</div>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="IP Fin"
                        value={r.end}
                        onChange={e => updateFormRange(idx, 'end', e.target.value)}
                        className="cd-input w-full !h-14 !text-xs font-mono !bg-white border-slate-200"
                      />
                    </div>
                    {formRanges.length > 1 && (
                      <button
                        onClick={() => removeFormRange(idx)}
                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP Segura</label>
                <input
                  type="text"
                  value={formSnmp}
                  onChange={e => setFormSnmp(e.target.value)}
                  className="cd-input w-full !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9] font-mono"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciclo de Actualización (Min)</label>
                <div className="relative">
                  <Clock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="number"
                    min={1}
                    value={formInterval}
                    onChange={e => setFormInterval(Number(e.target.value))}
                    className="cd-input w-full !pl-12 !bg-slate-50 border-transparent focus:!bg-white focus:!border-[#2980b9]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={generateKey}
                disabled={!formClientId || !formName.trim() || creating}
                className="bg-[#2980b9] hover:bg-[#2471a3] disabled:opacity-40 text-white rounded-2xl py-5 px-12 text-xs font-black shadow-2xl shadow-blue-900/20 transition-all active:scale-95 flex items-center gap-3"
              >
                {creating ? <RefreshCw className="animate-spin" size={18} /> : <Key size={18} />}
                {creating ? 'GENERANDO CREDENCIALES...' : 'GENERAR LLAVE MAESTRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Activation key result ─────────────────────────────────────────────── */}
      {activationKey && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-[40px] p-10 shadow-2xl shadow-emerald-900/10 animate-in zoom-in-95 duration-500">
          <div className="flex flex-col md:flex-row items-start gap-8">
            <div className="p-6 bg-emerald-500 text-white rounded-[32px] shadow-xl shadow-emerald-900/20 shrink-0">
              <ShieldCheck size={40} />
            </div>
            <div className="flex-1 w-full">
              <h3 className="text-2xl font-black text-emerald-900 tracking-tight">Acceso Concedido</h3>
              <p className="text-sm text-emerald-700 font-bold mt-2 mb-8 uppercase tracking-wide">
                La llave expira en 24 horas. Use el comando a continuación en la terminal del cliente.
              </p>
              <div className="group relative">
                <div className="p-8 bg-emerald-900 rounded-[28px] font-mono text-[13px] text-emerald-100 break-all leading-relaxed shadow-inner border border-emerald-800">
                  <span className="text-emerald-400">$</span> STC-Agent.exe --activate <span className="text-white font-black underline decoration-emerald-500 underline-offset-4">{activationKey}</span> --url {window.location.origin}
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`STC-Agent.exe --activate ${activationKey} --url ${window.location.origin}`);
                    showToast('Comando de activación copiado', 'success');
                  }}
                  className="absolute right-4 top-4 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90"
                  title="Copiar Comando"
                >
                  <Copy size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="cd-panel overflow-hidden border-none shadow-xl shadow-blue-900/5">
        <header className="px-10 py-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-[#2980b9] rounded-2xl">
              <Cpu size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-[#1a2333] tracking-tight">Nodos Registrados</h3>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Supervisión en tiempo real de agentes activos</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative flex-1 group">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#2980b9] transition-colors" />
              <input
                type="text"
                placeholder="Buscar nodo..."
                className="cd-input w-full !pl-12 !py-3 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 animate-pulse">
            <Loader2 size={48} className="animate-spin text-[#2980b9] mb-4" />
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Escaneando infraestructura...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>Identificación del Nodo</th>
                  <th>Hardware ID</th>
                  <th>Última Sincronización</th>
                  <th className="text-center">Estado de Seguridad</th>
                  <th className="text-right">Gestión</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-32 text-center bg-white">
                      <div className="flex flex-col items-center">
                        <div className="p-6 bg-slate-50 rounded-full mb-6">
                          <Activity size={48} className="text-slate-200" />
                        </div>
                        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sin agentes que coincidan con la búsqueda</p>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredAgents.map(agent => (
                  <tr key={agent.id} className="group/row transition-colors cursor-default">
                    <td>
                      <div className="flex flex-col">
                        <span className="font-black text-[#1a2333] group-hover/row:text-[#2980b9] transition-colors uppercase tracking-tight">
                          {agent.name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Nodo ID: {agent.id.substring(0, 8)}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-[11px] font-black text-slate-500 uppercase tracking-tighter bg-slate-50 px-2 py-1 rounded-lg">
                        {agent.hardware_id || '---'}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-50 rounded-xl group-hover/row:bg-blue-50 transition-colors">
                          <Clock size={14} className="text-slate-400 group-hover/row:text-[#2980b9]" />
                        </div>
                        <span className="text-xs font-bold uppercase text-slate-600">{formatLastSeen(agent.last_seen)}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      {agent.status === 'active' && (
                        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                          <ShieldCheck size={14} /> OPERATIVO
                        </span>
                      )}
                      {agent.status === 'revoked' && (
                        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-4 py-2 rounded-full border border-rose-100">
                          <ShieldOff size={14} /> REVOCADO
                        </span>
                      )}
                      {agent.status === 'pending' && (
                        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-4 py-2 rounded-full">
                          <Clock size={14} /> PENDIENTE
                        </span>
                      )}
                    </td>
                    <td className="text-right px-10">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover/row:opacity-100 transition-all">
                        {agent.status !== 'revoked' && (
                          <button
                            onClick={() => openConfigModal(agent)}
                            className="p-3 bg-blue-50 text-[#2980b9] hover:bg-[#2980b9] hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm"
                            title="Ajustes Remotos"
                          >
                            <Settings size={20} />
                          </button>
                        )}
                        <button
                          onClick={() => regenerateKey(agent)}
                          disabled={regenLoading === agent.id}
                          className="p-3 bg-amber-50 text-amber-500 hover:bg-amber-500 hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm disabled:opacity-40"
                          title="Regenerar Llave de Activación"
                        >
                          {regenLoading === agent.id
                            ? <RefreshCw size={20} className="animate-spin" />
                            : <Key size={20} />}
                        </button>
                        {agent.status === 'active' && (
                          <button
                            onClick={() => setAgentToRevoke(agent)}
                            className="p-3 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all active:scale-90 shadow-sm"
                            title="Revocar Licencia"
                          >
                            <ShieldOff size={20} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Regenerate Key Modal ───────────────────────────────────────────────── */}
      {regenModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <header className="px-10 py-8 bg-gradient-to-r from-amber-500 to-amber-400 text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black tracking-tight uppercase">Llave de Activación</h2>
                <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em] mt-1">Agente: {regenModal.agentName}</p>
              </div>
              <button onClick={() => setRegenModal(null)} className="relative z-10 p-3 hover:bg-white/20 rounded-2xl transition-all active:scale-90">
                <X size={28} />
              </button>
              <div className="absolute -right-8 -top-8 opacity-20">
                <Key size={140} />
              </div>
            </header>

            {/* Body */}
            <div className="p-10 space-y-8">
              {/* Warning */}
              <div className="flex gap-4 bg-amber-50 border border-amber-100 rounded-[28px] p-6">
                <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
                  <Clock size={22} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-black text-amber-800">Llave válida por 24 horas</p>
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    Expira: {new Date(regenModal.expiresAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </div>

              {/* Command box */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Comando de Activación</p>
                <div className="relative group">
                  <div className="p-8 bg-[#1a2333] rounded-[28px] font-mono text-[13px] text-emerald-100 break-all leading-relaxed shadow-inner border border-white/5">
                    <span className="text-emerald-400">$</span> STC-Agent.exe --activate{' '}
                    <span className="text-white font-black underline decoration-amber-400 underline-offset-4">{regenModal.key}</span>
                    {' '}--url {window.location.origin}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`STC-Agent.exe --activate ${regenModal.key} --url ${window.location.origin}`);
                      setKeyCopied(true);
                      showToast('Comando copiado al portapapeles', 'success');
                      setTimeout(() => setKeyCopied(false), 3000);
                    }}
                    className="absolute right-4 top-4 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-90 flex items-center gap-2"
                    title="Copiar Comando"
                  >
                    {keyCopied ? <Check size={20} className="text-emerald-400" /> : <Copy size={20} />}
                  </button>
                </div>
              </div>

              {/* Footer action */}
              <div className="flex justify-end">
                <button
                  onClick={() => setRegenModal(null)}
                  className="px-10 py-4 bg-[#1a2333] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#2c3e50] transition-all active:scale-95"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Config Modal ──────────────────────────────────────────────────────── */}
      {configModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-[#1a2333]/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
            <header className="px-10 py-10 bg-gradient-to-r from-[#1a2333] to-[#2c3e50] text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black tracking-tight uppercase">Control Remoto</h2>
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em] mt-1">Ajustes del nodo: {configModal.name}</p>
              </div>
              <button onClick={closeConfigModal} className="relative z-10 p-3 hover:bg-white/10 rounded-2xl transition-all active:scale-90">
                <X size={28} />
              </button>
              <div className="absolute -right-10 -top-10 opacity-10">
                <Settings size={160} />
              </div>
            </header>

            <div className="p-12">
              {loadingConfig ? (
                <div className="py-24 text-center">
                  <Loader2 size={64} className="animate-spin text-[#2980b9] mx-auto mb-6" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sincronizando con Agente...</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* IP Ranges */}
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Segmentos IP Activos</label>
                      <button
                        onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                        className="flex items-center gap-2 text-[10px] font-black text-[#2980b9] hover:text-[#2471a3] uppercase tracking-widest"
                      >
                        <Plus size={14} /> ADJUNTAR RANGO
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[250px] overflow-y-auto pr-4 custom-scrollbar">
                      {configForm.ip_ranges.length === 0 && (
                        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[32px]">
                          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Sin segmentación configurada</p>
                        </div>
                      )}

                      {configForm.ip_ranges.map((range, idx) => (
                        <div key={idx} className="flex items-center gap-4 animate-in slide-in-from-right-4 bg-slate-50 p-2 rounded-[24px]">
                          <input
                            type="text"
                            placeholder="IP Inicio"
                            value={range.start}
                            onChange={e => updateConfigRange(idx, 'start', e.target.value)}
                            className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-[#2980b9]"
                          />
                          <span className="text-slate-300 font-black">—</span>
                          <input
                            type="text"
                            placeholder="IP Fin"
                            value={range.end}
                            onChange={e => updateConfigRange(idx, 'end', e.target.value)}
                            className="cd-input w-full !h-12 !text-xs font-mono !bg-white border-transparent focus:!border-[#2980b9]"
                          />
                          <button
                            onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunidad SNMP</label>
                      <input
                        type="text"
                        value={configForm.snmp_community}
                        onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                        className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-[#2980b9] focus:!bg-white font-mono"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Frecuencia (Minutos)</label>
                      <input
                        type="number"
                        min={1}
                        value={configForm.scan_interval_minutes}
                        onChange={e => setConfigForm(f => ({ ...f, scan_interval_minutes: Number(e.target.value) }))}
                        className="cd-input w-full !h-14 !bg-slate-50 border-transparent focus:!border-[#2980b9] focus:!bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex gap-6 pt-6">
                    <button 
                      onClick={closeConfigModal} 
                      className="flex-1 py-5 rounded-[24px] border border-slate-200 text-slate-500 font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all active:scale-95"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={saveConfig}
                      disabled={savingConfig}
                      className="flex-2 px-12 py-5 bg-[#e67e22] hover:bg-[#d35400] disabled:opacity-40 text-white text-xs font-black rounded-[24px] shadow-2xl shadow-orange-900/20 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest"
                    >
                      {savingConfig ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                      {savingConfig ? 'Sincronizando...' : 'APLICAR CONFIGURACIÓN'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Revoke Modal */}
      <ConfirmModal
        isOpen={!!agentToRevoke}
        onClose={() => setAgentToRevoke(null)}
        onConfirm={revokeAgent}
        title="Revocación de Licencia de Nodo"
        message={`¿Está completamente seguro de que desea revocar el acceso para "${agentToRevoke?.name}"? Este nodo dejará de reportar datos y perderá su vínculo de seguridad con el servidor de forma irreversible.`}
        confirmText="Confirmar Revocación"
        isDanger={true}
        isLoading={!!revoking}
      />
    </div>
  );
};

export default Agents;
