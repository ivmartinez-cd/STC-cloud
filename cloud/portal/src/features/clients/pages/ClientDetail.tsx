import { useCallback, useState } from 'react';
import { useNow } from '../../../shared/hooks/useNow';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Bell, Droplets } from 'lucide-react';
import { useClientDetail } from '../hooks/useClientDetail';
import { useToast } from '../../../store/ToastContext';
import { useAuth } from '../../../store/AuthContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import CreateMonitorModal from '../components/CreateMonitorModal';
import ClientProfileCard from '../components/ClientProfileCard';
import ClientMetricsCards from '../components/ClientMetricsCards';
import ClientDetailTabs from '../components/ClientDetailTabs';
import ClientAttentionZone from '../components/ClientAttentionZone';
import ClientConfigZone from '../components/ClientConfigZone';
import ClientDevicesSection from '../components/ClientDevicesSection';
import ClientTabRedirect from '../components/ClientTabRedirect';
import type { ClientDetailTab } from '../types/clientDetail';

function parseTab(v: string | null): ClientDetailTab {
  return v === 'dispositivos' || v === 'alertas' || v === 'consumibles' || v === 'configuracion' ? v : 'resumen';
}

/** Tab activa reflejada en `?tab=` (README: "Tab... reflejados en la URL"). */
function useActiveTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<ClientDetailTab>(() => parseTab(searchParams.get('tab')));
  const setTab = useCallback((next: ClientDetailTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'resumen') params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return { tab, setTab };
}

/** Rediseño hifi "Cliente — detalle" (handoff 25/08/2026): jerarquiza en 3 zonas
 * rotuladas (identidad + 6 métricas + tabs; "Requiere atención"; "Configuración de
 * la cuenta") más la tabla "Infraestructura de monitoreo", en vez del mosaico plano
 * de ~10 tarjetas del mismo peso que había antes. */
const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isReadOnlyViewer = role === 'client_viewer';
  const { showToast } = useToast();
  const now = useNow();
  const {
    client, monitors, usage, stats, loading, error,
    createMonitor, deleteMonitor, updateNotifications, updateDeviceApprovalRequired, updateClientProfile,
  } = useClientDetail(id!);
  const { tab, setTab } = useActiveTab();

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

  return (
    <div className="-m-4 flex min-w-0 flex-col gap-4 bg-surface-page px-[34px] pb-9 pt-[26px] md:-m-10 md:h-full md:min-h-0">
      <nav className="mb-1 flex items-center gap-2 font-sans text-xs">
        <Link to="/clients" className="font-semibold text-brand-accent hover:underline">Clientes</Link>
        <span className="text-ink-sep-light">/</span>
        {client ? <span className="text-ink-700">{client.name}</span> : <div className="h-4 w-24 animate-pulse rounded-full bg-surface-track" />}
      </nav>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <Loader2 className="animate-spin text-brand" size={40} />
          <p className="font-extrabold uppercase tracking-widest text-[10px] text-ink-300">Cargando expediente del cliente...</p>
        </div>
      )}

      {error && (
        <div className="rounded-[5px] border border-brand-chip-border bg-brand-soft p-6 font-sans text-[13px] font-semibold text-brand-severe">{error}</div>
      )}

      {!loading && !error && client && (
        <>
          <div className="rounded-[5px] border border-line-100 bg-white">
            <ClientProfileCard client={client} monitors={monitors} canEdit={!isReadOnlyViewer} onSave={updateClientProfile} />
            <ClientMetricsCards client={client} monitors={monitors} usage={usage} stats={stats} />
            <ClientDetailTabs active={tab} onChange={setTab} />
          </div>

          {tab === 'resumen' && (
            <ClientAttentionZone
              client={client} usage={usage} monitors={monitors} now={now} isReadOnlyViewer={isReadOnlyViewer}
              onSaveNotifications={updateNotifications} onToggleDeviceApproval={updateDeviceApprovalRequired}
              onCreateMonitor={() => setShowMonitorModal(true)} onDeleteMonitor={setMonitorToDelete}
            />
          )}

          {tab === 'dispositivos' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <ClientDevicesSection clientId={id!} active={tab === 'dispositivos'} />
            </div>
          )}

          {tab === 'alertas' && (
            <ClientTabRedirect
              icon={Bell} title="Alertas de este cliente"
              description="Reusa el listado completo de alertas, filtrado por este cliente."
              href={`/alerts?client_id=${id}`} cta="Ver alertas"
            />
          )}

          {tab === 'consumibles' && (
            <ClientTabRedirect
              icon={Droplets} title="Consumibles de este cliente"
              description="Reusa el listado completo de consumibles de flota, filtrado por este cliente."
              href={`/supplies?client_id=${id}`} cta="Ver consumibles"
            />
          )}

          {tab === 'configuracion' && !isReadOnlyViewer && <ClientConfigZone clientId={id!} canEdit={!isReadOnlyViewer} />}
        </>
      )}

      <CreateMonitorModal isOpen={showMonitorModal} onClose={() => setShowMonitorModal(false)} onCreate={createMonitor} />

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
