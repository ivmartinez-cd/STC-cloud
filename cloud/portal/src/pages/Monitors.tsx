import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, RefreshCw, X, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import RegisterMonitorPanel from '../components/monitors/RegisterMonitorPanel';
import MonitorsTable from '../components/monitors/MonitorsTable';
import MonitorConfigModal from '../components/monitors/MonitorConfigModal';
import type { MonitorListItem, ClientOption } from '../types/monitorsPage';

const Monitors = () => {
  const [monitors, setMonitors]           = useState<MonitorListItem[]>([]);
  const [clients, setClients]             = useState<ClientOption[]>([]);
  const [loading, setLoading]             = useState(true);
  const [revoking, setRevoking]           = useState<string | null>(null);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const { showToast } = useToast();

  const [configModal, setConfigModal]     = useState<{ id: string; name: string } | null>(null);

  // Delete Monitor modal
  const [monitorToDelete, setMonitorToDelete] = useState<{ id: string, name: string } | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  const loadMonitors = useCallback(async (isRefresh = false) => {
    if (isRefresh) showToast('Actualizando datos...', 'info');
    try {
      const data = await api.get<MonitorListItem[]>('/agents');
      setMonitors(data);
      if (isRefresh) showToast('Lista de monitores actualizada', 'success');
    } catch (e: unknown) {
      showToast('Error al cargar monitores: ' + (e as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    Promise.all([
      api.get<MonitorListItem[]>('/agents').then(setMonitors),
      api.get<ClientOption[]>('/clients').then(setClients),
    ])
    .catch((e: Error) => showToast('Error inicial: ' + e.message, 'error'))
    .finally(() => setLoading(false));
  }, [showToast]);

  const revokeMonitor = async (id: string) => {
    setRevoking(id);
    try {
      await api.post(`/agents/${id}/revoke`, {});
      showToast('Acceso revocado correctamente', 'success');
      await loadMonitors();
    } catch (e: unknown) {
      showToast('Error al revocar: ' + (e as Error).message, 'error');
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
    } catch (e: unknown) {
      showToast('Error al eliminar: ' + (e as Error).message, 'error');
    } finally {
      setDeletingMonitor(false);
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
            className="p-3 text-slate-400 hover:text-brand hover:bg-white rounded-xl transition-all shadow-sm border border-slate-100"
            title="Actualizar"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => { setShowForm(f => !f); setActivationKey(null); }}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 ${
              showForm
                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-[#f7931d] text-white shadow-orange-900/20 hover:bg-[#d35400]'
            }`}
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? 'Cancelar Registro' : 'Nuevo Monitor'}
          </button>
        </div>
      </header>

      {showForm && (
        <RegisterMonitorPanel
          clients={clients}
          onCreated={(key) => {
            setActivationKey(key);
            setShowForm(false);
            loadMonitors();
          }}
        />
      )}

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
                <span className="text-emerald-800">STCCloudMonitor.exe --activate <span className="font-bold underline">{activationKey}</span> --server {window.location.origin}</span>
                <Info size={16} className="text-emerald-400 shrink-0" />
              </div>
            </div>
          </div>
        </div>
      )}

      <MonitorsTable
        monitors={monitors}
        loading={loading}
        revoking={revoking}
        onConfigure={(monitor) => setConfigModal({ id: monitor.id, name: monitor.name })}
        onRevoke={revokeMonitor}
        onDeleteClick={(monitor) => setMonitorToDelete({ id: monitor.id, name: monitor.name })}
      />

      {configModal && (
        <MonitorConfigModal monitor={configModal} onClose={() => setConfigModal(null)} />
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
