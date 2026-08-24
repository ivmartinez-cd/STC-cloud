import { useState } from 'react';
import { useNow } from '../hooks/useNow';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Users, Loader2 } from 'lucide-react';
import { useClientDetail } from '../hooks/useClientDetail';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import ConfirmModal from '../components/ConfirmModal';
import ClientUsageChart from '../components/agents/ClientUsageChart';
import CreateMonitorModal from '../components/monitors/CreateMonitorModal';
import ApiKeysCard from '../components/clients/ApiKeysCard';
import CustomFieldsCard from '../components/clients/CustomFieldsCard';
import IncidentRulesCard from '../components/clients/IncidentRulesCard';
import NotificationSettingsCard from '../components/clients/NotificationSettingsCard';
import DeviceApprovalCard from '../components/clients/DeviceApprovalCard';
import DuplicateDevicesCard from '../components/clients/DuplicateDevicesCard';
import ClientMetricsCards from '../components/clients/ClientMetricsCards';
import ClientProfileCard from '../components/clients/ClientProfileCard';
import ClientMonitorsSection from '../components/clients/ClientMonitorsSection';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  // Alta/baja de monitor son POST/DELETE /agents — fuera del allowlist de
  // client_viewer (ver rolePolicy.ts): sin este chequeo el botón mandaría la
  // request y el usuario vería un 403 recién al hacer click.
  const isReadOnlyViewer = role === 'client_viewer';
  const { showToast } = useToast();
  const now = useNow();
  const { client, monitors, usage, loading, error, createMonitor, deleteMonitor, updateNotifications, updateDeviceApprovalRequired } = useClientDetail(id!);

  const [showMonitorModal, setShowMonitorModal] = useState(false);
  const [monitorToDelete, setMonitorToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState(false);

  const handleDeleteMonitor = async () => {
    if (!monitorToDelete) return;
    setDeletingMonitor(true);
    try {
      await deleteMonitor(monitorToDelete.id);
      showToast(`Monitor ${monitorToDelete.name} eliminado`, 'success');
      setMonitorToDelete(null);
    } catch (err: unknown) {
      showToast('Error al eliminar monitor: ' + (err as Error).message, 'error');
    } finally {
      setDeletingMonitor(false);
    }
  };

  const onlineMonitors = monitors.filter(m =>
    m.status === 'active' && m.last_seen !== null
    && (now - new Date(m.last_seen).getTime() <= OFFLINE_THRESHOLD_MS)
  ).length;

  const totalPagesMonth = usage.length > 0
    ? usage[usage.length - 1].mono + usage[usage.length - 1].color
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/clients" className="flex items-center gap-2 text-slate-400 hover:text-brand font-bold uppercase tracking-widest transition-colors">
          <Users size={14} /> Clientes
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        {client ? (
          <span className="text-brand font-extrabold uppercase tracking-widest">{client.name}</span>
        ) : (
          <div className="h-4 w-24 bg-slate-100 animate-pulse rounded-full" />
        )}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-brand" size={40} />
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
            <ClientMetricsCards
              deviceCount={client.device_count}
              monitorCount={monitors.length}
              onlineMonitors={onlineMonitors}
              totalPagesMonth={totalPagesMonth}
            />

            <ClientProfileCard client={client} />

            <NotificationSettingsCard
              email={client.notification_email}
              webhookUrl={client.notification_webhook_url}
              canEdit={!isReadOnlyViewer}
              onSave={updateNotifications}
            />

            {!isReadOnlyViewer && id && (
              <DeviceApprovalCard
                enabled={client.device_approval_required}
                canEdit={!isReadOnlyViewer}
                onSave={updateDeviceApprovalRequired}
                clientId={id}
              />
            )}

            {!isReadOnlyViewer && id && <DuplicateDevicesCard clientId={id} />}

            {/* Usage Chart */}
            <ClientUsageChart usage={usage} />

            {!isReadOnlyViewer && id && <ApiKeysCard clientId={id} canEdit={!isReadOnlyViewer} />}
            {!isReadOnlyViewer && id && <CustomFieldsCard clientId={id} canEdit={!isReadOnlyViewer} />}
            {!isReadOnlyViewer && id && <IncidentRulesCard clientId={id} canEdit={!isReadOnlyViewer} />}
          </div>

          <ClientMonitorsSection
            monitors={monitors}
            now={now}
            isReadOnlyViewer={isReadOnlyViewer}
            onCreateClick={() => setShowMonitorModal(true)}
            onDeleteClick={setMonitorToDelete}
          />
        </>
      )}

      <CreateMonitorModal
        isOpen={showMonitorModal}
        onClose={() => setShowMonitorModal(false)}
        onCreate={createMonitor}
      />

      <ConfirmModal
        isOpen={!!monitorToDelete}
        onClose={() => setMonitorToDelete(null)}
        onConfirm={handleDeleteMonitor}
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
