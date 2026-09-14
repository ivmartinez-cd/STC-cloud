import { useCallback, useState } from 'react';
import { useNow } from '../../../shared/hooks/useNow';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useClientDetail } from '../hooks/useClientDetail';
import { useToast } from '../../../store/ToastContext';
import { useAuth } from '../../../store/AuthContext';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import CreateMonitorModal from '../components/CreateMonitorModal';
import ClientProfileCard from '../components/ClientProfileCard';
import ClientDetailTabs from '../components/ClientDetailTabs';
import ClientAttentionZone from '../components/ClientAttentionZone';
import ClientConfigZone from '../components/ClientConfigZone';
import ClientDevicesSection from '../components/ClientDevicesSection';
import ClientAlertsSection from '../components/ClientAlertsSection';
import ClientSuppliesSection from '../components/ClientSuppliesSection';
import { safeReturnTo } from '../../../shared/lib/returnTo';
import type { ClientDetailTab } from '../types/clientDetail';

/** `?tab=configuracion` compartido por un admin dejaba al cliente con la tab marcada
 * y la pantalla vacía (el contenido es de gestión y no se monta para ese rol). */
function parseTab(v: string | null, isReadOnlyViewer: boolean): ClientDetailTab {
  const tab = v === 'dispositivos' || v === 'alertas' || v === 'consumibles' || v === 'configuracion' ? v : 'resumen';
  return isReadOnlyViewer && tab === 'configuracion' ? 'resumen' : tab;
}

/** Tab activa reflejada en `?tab=` (README: "Tab... reflejados en la URL"). La URL
 * es la única fuente de verdad (derivada en cada render, no `useState` inicializado
 * una vez): atrás/adelante y links entrantes se reflejan. `replace`: cambiar de tab
 * no apila historial.
 *
 * Al cambiar de tab se conservan SÓLO `tab` y `from`: Dispositivos, Alertas y
 * Consumibles guardan cada una su filtro y página en la URL con nombres que se
 * pisan (`q`, `page`), y arrastrarlos de una a otra aplicaba la búsqueda de
 * equipos a las alertas o abría Consumibles en la página 3. */
function useActiveTab(isReadOnlyViewer: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'), isReadOnlyViewer);
  // `?from=` = la cartera con sus filtros/página (`ClientsDirectoryTable`); sólo se
  // acepta el listado de clientes (no `//evil`, no otra ruta).
  // `safeReturnTo` es la única validación de destino del portal (rechaza `//evil`,
  // esquemas externos, travesía); acá sólo se exige además que sea LA cartera.
  const backTo = safeReturnTo(searchParams.get('from'));
  const listBackTo = backTo && /^\/clients(\?|$)/.test(backTo) ? backTo : '/clients';
  const setTab = useCallback((next: ClientDetailTab) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams();
      const from = prev.get('from');
      if (from) params.set('from', from);
      if (next !== 'resumen') params.set('tab', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  return { tab, setTab, listBackTo };
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
    client, monitors, usage, loading, error,
    createMonitor, deleteMonitor, updateNotifications, updateDeviceApprovalRequired, updateClientProfile,
  } = useClientDetail(id!);
  const { tab, setTab, listBackTo } = useActiveTab(isReadOnlyViewer);

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
    <div className="-m-4 flex min-w-0 flex-col gap-4 bg-surface-page px-[34px] pb-9 pt-[26px] short:gap-3 short:pb-4 short:pt-3 md:-m-10 md:h-full md:min-h-0">
      <nav className="mb-1 flex items-center gap-2 font-sans text-xs">
        <Link to={listBackTo} className="font-semibold text-brand-accent hover:underline">Clientes</Link>
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
            <ClientDetailTabs active={tab} onChange={setTab} isReadOnlyViewer={isReadOnlyViewer} />
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
            <div className="flex min-h-0 flex-1 flex-col">
              <ClientAlertsSection clientId={id!} />
            </div>
          )}

          {tab === 'consumibles' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <ClientSuppliesSection clientId={id!} />
            </div>
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
