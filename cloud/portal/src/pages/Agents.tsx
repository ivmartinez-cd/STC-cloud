import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useTime } from '../hooks/useTime';
import ConfirmModal from '../components/ConfirmModal';
import AgentTable from '../components/agents/AgentTable';
import CreateAgentModal from '../components/agents/CreateAgentModal';
import ConfigAgentModal from '../components/agents/ConfigAgentModal';
import RegenKeyModal from '../components/agents/RegenKeyModal';
import type { Agent, Client } from '../types/agents';

const Agents = () => {
  const { showToast } = useToast();
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [clients, setClients]       = useState<Client[]>([]);
  const [loading, setLoading]       = useState(true);
  const [revoking, setRevoking]     = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [agentToRevoke, setAgentToRevoke]   = useState<Agent | null>(null);
  const [configModal, setConfigModal]       = useState<{ id: string; name: string } | null>(null);
  const [regenModal, setRegenModal]         = useState<{ agentName: string; key: string; expiresAt: string } | null>(null);

  const now = useTime();

  const loadAgents = useCallback(async () => {
    try {
      const data = await api.get<Agent[]>('/agents');
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error al cargar agentes', 'error');
    }
  }, [showToast]);

  const loadClients = useCallback(async () => {
    try {
      const data = await api.get<Client[]>('/clients');
      setClients(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error al cargar clientes', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    Promise.all([loadAgents(), loadClients()]).finally(() => setLoading(false));
  }, [loadAgents, loadClients]);

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
      showToast('Nueva llave generada — válida por 24 h', 'success');
      await loadAgents();
    } catch (e: unknown) {
      showToast('Error al regenerar: ' + (e as Error).message, 'error');
    } finally {
      setRegenLoading(null);
    }
  };

  const toggleForm = () => {
    if (!showForm) setActivationKey(null);
    setShowForm(f => !f);
  };

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
            className="p-4 bg-white border border-slate-100 text-slate-400 hover:text-brand rounded-2xl transition-all shadow-sm active:scale-95"
            title="Sincronizar Lista"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={toggleForm}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 shadow-xl ${
              showForm
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-slate-200/20'
                : 'bg-gradient-to-r from-brand to-[#3498db] text-white hover:shadow-blue-900/30'
            }`}
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            {showForm ? 'CANCELAR' : 'DESPLEGAR NUEVO'}
          </button>
        </div>
      </header>

      <CreateAgentModal
        show={showForm}
        clients={clients}
        activationKey={activationKey}
        onClose={() => setShowForm(false)}
        onKeyGenerated={setActivationKey}
        onCreated={loadAgents}
      />

      <AgentTable
        agents={agents}
        loading={loading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        now={now}
        regenLoading={regenLoading}
        revoking={revoking}
        onConfig={agent => setConfigModal({ id: agent.id, name: agent.name })}
        onRegen={regenerateKey}
        onRevoke={setAgentToRevoke}
      />

      <ConfigAgentModal modal={configModal} onClose={() => setConfigModal(null)} />

      <RegenKeyModal modal={regenModal} onClose={() => setRegenModal(null)} />

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
