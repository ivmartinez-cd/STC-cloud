import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, ShieldCheck, ShieldOff, RefreshCw, X, Settings, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

interface Agent {
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
  return new Date(ts).toLocaleString();
}

const emptyRange = (): IpRange => ({ start: '', end: '' });

const defaultConfig: AgentConfig = {
  ip_ranges: [],
  snmp_community: 'public',
  scan_interval_minutes: 15,
};

const Agents = () => {
  const [agents, setAgents]               = useState<Agent[]>([]);
  const [clients, setClients]             = useState<Client[]>([]);
  const [loading, setLoading]             = useState(true);
  const [revoking, setRevoking]           = useState<string | null>(null);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const [creating, setCreating]           = useState(false);

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

  const loadAgents = useCallback(async () => {
    try {
      const data = await api.get<Agent[]>('/agents');
      setAgents(data);
    } catch (e: any) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<Agent[]>('/agents').then(setAgents),
      api.get<Client[]>('/clients').then(setClients),
    ]).finally(() => setLoading(false));
  }, []);

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
        alert('Completa todas las IPs de inicio y fin, o elimina el rango vacío.');
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
      await loadAgents();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  const revokeAgent = async (id: string) => {
    if (!confirm('¿Revocar este agente? Dejará de poder conectarse al servidor.')) return;
    setRevoking(id);
    try {
      await api.post(`/agents/${id}/revoke`, {});
      await loadAgents();
    } catch (e: any) {
      alert('Error al revocar: ' + e.message);
    } finally {
      setRevoking(null);
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
        alert('Todos los rangos deben tener IP de inicio y fin.');
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
      closeConfigModal();
    } catch (e: any) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Agentes</h1>
          <p className="text-gray-500 mt-1">Conectores instalados en redes de clientes.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadAgents}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => { setShowForm(f => !f); setActivationKey(null); if (showForm) resetForm(); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? 'Cancelar' : 'Nuevo Agente'}
          </button>
        </div>
      </header>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 space-y-5">
          <h3 className="font-semibold">Crear nuevo agente</h3>

          {/* Cliente + Nombre */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select
              value={formClientId}
              onChange={e => setFormClientId(e.target.value)}
              className="bg-gray-800/50 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60"
            >
              <option value="">Seleccionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <input
              type="text"
              placeholder="Nombre del agente (ej: Servidor Central)"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="bg-gray-800/50 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600"
            />
          </div>

          {/* Rangos IP */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-300">Rangos de IP a escanear</label>
              <button
                onClick={addFormRange}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus size={12} /> Agregar rango
              </button>
            </div>
            <div className="space-y-2">
              {formRanges.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="IP inicio (ej: 192.168.1.1)"
                    value={r.start}
                    onChange={e => updateFormRange(idx, 'start', e.target.value)}
                    className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600 font-mono"
                  />
                  <span className="text-gray-600 text-sm shrink-0">—</span>
                  <input
                    type="text"
                    placeholder="IP fin (ej: 192.168.1.254)"
                    value={r.end}
                    onChange={e => updateFormRange(idx, 'end', e.target.value)}
                    className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600 font-mono"
                  />
                  {formRanges.length > 1 && (
                    <button
                      onClick={() => removeFormRange(idx)}
                      className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SNMP + Intervalo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Comunidad SNMP</label>
              <input
                type="text"
                value={formSnmp}
                onChange={e => setFormSnmp(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Intervalo de scan (min)</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={formInterval}
                onChange={e => setFormInterval(Number(e.target.value))}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={generateKey}
              disabled={!formClientId || !formName.trim() || creating}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl py-2.5 px-6 text-sm font-medium transition-colors"
            >
              {creating ? 'Generando...' : 'Generar llave de activación'}
            </button>
          </div>
        </div>
      )}

      {/* ── Activation key result ─────────────────────────────────────────────── */}
      {activationKey && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-500/20 rounded-xl text-green-400 shrink-0">
              <Key size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-green-400 font-bold">Llave de Activación Generada</h3>
              <p className="text-sm text-gray-400 mt-1 mb-3">
                Expira en 24 h. Ejecutar en el servidor del cliente:
              </p>
              <div className="p-4 bg-[#0B0F1A] rounded-xl border border-gray-800 font-mono text-xs text-gray-300 break-all select-all">
                ContadorImpresoras.exe --activate {activationKey} --server https://tu-dominio.com
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6">
        <h3 className="font-bold mb-6">Agentes registrados ({agents.length})</h3>

        {loading ? (
          <div className="text-center py-10 text-gray-500">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="text-xs uppercase bg-gray-800/50 text-gray-500">
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">Nombre</th>
                  <th className="px-6 py-4">Hardware ID</th>
                  <th className="px-6 py-4">Último heartbeat</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 rounded-tr-xl">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-600">
                      No hay agentes registrados. Crea el primero con el botón "Nuevo Agente".
                    </td>
                  </tr>
                )}
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{agent.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      {agent.hardware_id || '—'}
                    </td>
                    <td className="px-6 py-4">{formatLastSeen(agent.last_seen)}</td>
                    <td className="px-6 py-4">
                      {agent.status === 'active' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-lg">
                          <ShieldCheck size={12} /> Activo
                        </span>
                      )}
                      {agent.status === 'revoked' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 px-2.5 py-1 rounded-lg">
                          <ShieldOff size={12} /> Revocado
                        </span>
                      )}
                      {agent.status === 'pending' && (
                        <span className="text-xs text-gray-500 bg-gray-700/30 px-2.5 py-1 rounded-lg">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {agent.status !== 'revoked' && (
                          <button
                            onClick={() => openConfigModal(agent)}
                            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                            title="Editar rangos IP"
                          >
                            <Settings size={14} /> Configurar
                          </button>
                        )}
                        {agent.status === 'active' && (
                          <button
                            onClick={() => revokeAgent(agent.id)}
                            disabled={revoking === agent.id}
                            className="text-red-400 hover:text-red-300 disabled:opacity-40 text-sm font-medium transition-colors"
                          >
                            {revoking === agent.id ? 'Revocando...' : 'Revocar'}
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

      {/* ── Config Modal ──────────────────────────────────────────────────────── */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111827] border border-gray-700 rounded-3xl p-8 w-full max-w-2xl mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold">Configurar Agente</h2>
                <p className="text-sm text-gray-500 mt-0.5">{configModal.name}</p>
              </div>
              <button onClick={closeConfigModal} className="text-gray-500 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            {loadingConfig ? (
              <div className="py-12 text-center text-gray-500">Cargando configuración...</div>
            ) : (
              <div className="space-y-6">
                {/* IP Ranges */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium text-gray-300">Rangos de IP</label>
                    <button
                      onClick={() => setConfigForm(f => ({ ...f, ip_ranges: [...f.ip_ranges, emptyRange()] }))}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Plus size={13} /> Agregar rango
                    </button>
                  </div>

                  {configForm.ip_ranges.length === 0 && (
                    <p className="text-sm text-gray-600 italic py-3 text-center border border-dashed border-gray-700 rounded-xl">
                      Sin rangos. El agente no hará scan hasta que agregues uno.
                    </p>
                  )}

                  <div className="space-y-2">
                    {configForm.ip_ranges.map((range, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="IP inicio"
                          value={range.start}
                          onChange={e => updateConfigRange(idx, 'start', e.target.value)}
                          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600 font-mono"
                        />
                        <span className="text-gray-600 text-sm shrink-0">—</span>
                        <input
                          type="text"
                          placeholder="IP fin"
                          value={range.end}
                          onChange={e => updateConfigRange(idx, 'end', e.target.value)}
                          className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600 font-mono"
                        />
                        <button
                          onClick={() => setConfigForm(f => ({ ...f, ip_ranges: f.ip_ranges.filter((_, i) => i !== idx) }))}
                          className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SNMP + Intervalo */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Comunidad SNMP</label>
                    <input
                      type="text"
                      value={configForm.snmp_community}
                      onChange={e => setConfigForm(f => ({ ...f, snmp_community: e.target.value }))}
                      className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Intervalo de scan (min)</label>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={configForm.scan_interval_minutes}
                      onChange={e => setConfigForm(f => ({ ...f, scan_interval_minutes: Number(e.target.value) }))}
                      className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-blue-500/60"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-600">
                  Los cambios se aplican en el próximo heartbeat del agente (máx. 60 s).
                </p>

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeConfigModal} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={saveConfig}
                    disabled={savingConfig}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {savingConfig ? 'Guardando...' : 'Guardar configuración'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Agents;
