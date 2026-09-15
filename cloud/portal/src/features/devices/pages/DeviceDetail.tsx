import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useAuth } from '../../../store/AuthContext';
import { useToast } from '../../../store/ToastContext';
import { useTime } from '../../../shared/hooks/useTime';
import DetailTabs from '../../../shared/components/DetailTabs';
import { ConfirmationModal } from '../../../shared/components/ConfirmationModal';
import { EditDeviceModal, DecommissionDeviceModal, MoveDeviceModal, MergeDeviceModal } from '../../../shared/components/DeviceLifecycleModals';
import DeviceProfileCard from '../components/detail/DeviceProfileCard';
import DeviceStatusBanners from '../components/detail/DeviceStatusBanners';
import GeneralTab from '../components/detail/GeneralTab';
import CountersTab from '../components/detail/CountersTab';
import SuppliesTable from '../components/detail/SuppliesTable';
import MediaTab from '../components/detail/MediaTab';
import AlertsTab from '../components/detail/AlertsTab';
import IncidentsTab from '../components/detail/IncidentsTab';
import HistoryTab from '../components/detail/HistoryTab';
import CostsTab from '../components/detail/CostsTab';
import SupplyDetailModal from '../../../shared/components/SupplyDetailModal';
import { useSupplyDetailParam } from '../../../shared/hooks/useSupplyDetailParam';
import { useDeviceDetail } from '../hooks/useDeviceDetail';
import { useDeviceStats, useDevicePrintTrend } from '../hooks/useDeviceOverview';
import { safeReturnTo, returnToLabel } from '../../../shared/lib/returnTo';
import type { AuditLogItem, AuditLogsResponse } from '../../../shared/types/audit';
import type { Incident, IncidentListResponse } from '../../../shared/types/incidents';
import type { DeviceDetailTab } from '../types/deviceDetailPage';

const TABS: Array<{ id: DeviceDetailTab; label: string }> = [
  { id: 'general', label: 'Vista general' }, { id: 'counters', label: 'Recuentos' }, { id: 'supplies', label: 'Consumibles' },
  { id: 'media', label: 'Bandejas' }, { id: 'alerts', label: 'Alertas' }, { id: 'incidents', label: 'Incidentes' },
  { id: 'costs', label: 'Costes' }, { id: 'history', label: 'Historial' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));
/** Contenido sólo para admin/operator (`canSeeHistory`): costes de la flota y
 * auditoría del equipo. El acceso remoto a la web embebida ya no es una
 * pestaña: vive en la tarjeta "Identificación" de Vista general
 * (`EwsAccessLink`), gateado por rol ahí mismo. */
const STAFF_ONLY_TABS: ReadonlySet<DeviceDetailTab> = new Set<DeviceDetailTab>(['costs', 'history']);

/** `?tab=` inválido cae a Vista general; para un client_viewer también las tabs que
 * no ve — si no, la barra quedaba con la pestaña marcada y la pantalla vacía debajo
 * (mismo criterio que `MonitorDetail`). */
function parseTab(raw: string | null, canSeeHistory: boolean): DeviceDetailTab {
  const tab = raw && TAB_IDS.has(raw as DeviceDetailTab) ? (raw as DeviceDetailTab) : 'general';
  return !canSeeHistory && STAFF_ONLY_TABS.has(tab) ? 'general' : tab;
}

function useLazyTab<T>(active: boolean, path: string, unwrap: (data: unknown) => T, fallback: T) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active || data !== null) return;
    setLoading(true);
    api.get<unknown>(path).then((d) => setData(unwrap(d))).catch(() => setData(fallback)).finally(() => setLoading(false));
  }, [active, data, path, unwrap, fallback]);
  return { data, loading };
}

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const { showToast } = useToast();
  const now = useTime(30000);
  const isReadOnlyViewer = role === 'client_viewer';
  const canSeeHistory = role === 'admin' || role === 'operator';

  const [searchParams, setSearchParams] = useSearchParams();
  // `from` sobrevive a un refresh (a diferencia de router state): guarda la URL completa
  // de la pantalla de origen (tab/página/filtro/orden) para volver exactamente ahí.
  // Derivados de la URL en cada render (no `useState` inicializado una vez): así
  // atrás/adelante del navegador se refleja en la pestaña. `handleTabChange` conserva
  // `from` en la URL, y `safeReturnTo` descarta cualquier destino que no sea un path
  // interno conocido (`//evil`, `http:`…).
  const backTo = safeReturnTo(searchParams.get('from'));
  const monitorBackTo = backTo?.startsWith('/monitors/') ? backTo : undefined;
  const clientBackTo = backTo?.startsWith('/clients/') ? backTo : undefined;
  // Orígenes que no encajan en el breadcrumb jerárquico (Inventario, Alertas,
  // Incidentes, Movimientos, Consumibles, Reportes): van como "volver" aparte.
  const listBackTo = backTo && !monitorBackTo && !clientBackTo ? backTo : undefined;
  const activeTab = parseTab(searchParams.get('tab'), canSeeHistory);
  const visibleTabs = canSeeHistory ? TABS : TABS.filter((t) => !STAFF_ONLY_TABS.has(t.id));
  // `replace`: cambiar de pestaña no debe apilar entradas en el historial, si no el
  // botón "atrás" del navegador desanda pestaña por pestaña antes de salir del equipo.
  const handleTabChange = (tab: DeviceDetailTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const {
    device, alerts, loading, error, refetch, customFieldDefs, details, supplyRows, activeAlerts,
    deleteDevice, recommission, recommissioning, changeMonitorState, changingMonitorState,
  } = useDeviceDetail(id!);
  const { stats, refetch: refetchStats } = useDeviceStats(id!);
  const { trend, loading: trendLoading, error: trendError, refetch: refetchTrend } = useDevicePrintTrend(id!);

  const [editOpen, setEditOpen] = useState(false);
  const [decommissionOpen, setDecommissionOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // "Detalles del consumible" en la URL (`?supply=`) — igual que en Consumibles.
  const [supplyTarget, setSupplyTarget] = useSupplyDetailParam();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [requestingSupply, setRequestingSupply] = useState(false);

  const history = useLazyTab<AuditLogItem[]>(activeTab === 'history' && canSeeHistory, `/audit-logs?target_id=${id}&limit=50`, (d) => (d as AuditLogsResponse).items, []);
  const incidents = useLazyTab<Incident[]>(activeTab === 'incidents', `/incidents?device_id=${id}&limit=50`, (d) => (d as IncidentListResponse).items, []);

  const handleDelete = async () => {
    setDeleting(true); setDeleteError(null);
    try { await deleteDevice(backTo); } catch (e) { setDeleteError(e instanceof Error ? e.message : String(e)); } finally { setDeleting(false); }
  };

  const handleSync = async () => {
    if (!device?.agent_id) return;
    setSyncing(true);
    try { await api.post(`/agents/${device.agent_id}/scan`); showToast('Barrido solicitado', 'success'); await refetch(); refetchStats(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Error al solicitar el barrido', 'error'); }
    finally { setSyncing(false); }
  };

  const handleRequestSupply = async () => {
    if (!device) return;
    const lowest = stats?.lowest_supply;
    setRequestingSupply(true);
    try {
      await api.post('/supply-requests', {
        client_id: device.client_id, device_id: device.id,
        supply_kind: (lowest?.label ?? 'Consumible').slice(0, 30),
        description: lowest ? `${lowest.label} al ${lowest.pct}%` : undefined,
      });
      showToast('Pedido de consumible registrado', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Error al registrar el pedido', 'error'); }
    finally { setRequestingSupply(false); }
  };

  const latest = null; // las lecturas crudas ya no se muestran acá; "Contadores actuales" usa `device.*`
  const totalPages = device?.total_pages ?? null;
  const monoPages = device?.mono_pages ?? null;
  const colorPages = device?.color_pages ?? null;
  const counters = useMemo(() => details?.counters, [details]);
  const extra = useMemo(() => details?.device, [details]);

  if (loading && !device) {
    return <div className="p-10 text-center font-sans text-[12.5px] text-ink-300">Cargando equipo…</div>;
  }
  if (error || !device) {
    return (
      <div className="p-10 text-center">
        <p className="mb-4 font-sans text-[13px] text-ink-700">{error || 'El equipo solicitado no existe o no tenés permisos.'}</p>
        <Link to="/devices" className="font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline">Volver a Dispositivos</Link>
      </div>
    );
  }

  return (
    <div className="-m-4 flex min-w-0 flex-col gap-4 bg-surface-page px-[34px] pb-9 pt-[26px] short:gap-3 short:pb-4 short:pt-3 md:-m-10 md:h-full md:min-h-0">
      <nav className="mb-1 flex items-center gap-2 font-sans text-xs">
        {listBackTo && (
          <>
            <Link to={listBackTo} className="font-semibold text-brand-accent hover:underline">← Volver a {returnToLabel(listBackTo)}</Link>
            <span className="text-ink-sep-light">·</span>
          </>
        )}
        <Link to="/clients" className="font-semibold text-brand-accent hover:underline">Clientes</Link>
        <span className="text-ink-sep-light">/</span>
        {device.client_id && <Link to={clientBackTo || `/clients/${device.client_id}`} className="font-semibold text-brand-accent hover:underline">{device.client_name}</Link>}
        <span className="text-ink-sep-light">/</span>
        {device.agent_id && <Link to={monitorBackTo || `/monitors/${device.agent_id}`} className="font-semibold text-brand-accent hover:underline">{device.monitor_name}</Link>}
        <span className="text-ink-sep-light">/</span>
        <span className="text-ink-700">{device.model ?? device.name}</span>
      </nav>

      <DeviceStatusBanners device={device} />

      <div className="rounded-[5px] border border-line-100 bg-white">
        <DeviceProfileCard
          device={device} now={now} isReadOnlyViewer={isReadOnlyViewer} alertsOpen={activeAlerts.length}
          syncing={syncing} requestingSupply={requestingSupply} changingMonitorState={changingMonitorState} recommissioning={recommissioning}
          onSync={handleSync} onRequestSupply={handleRequestSupply}
          onMove={() => setMoveOpen(true)} onEdit={() => setEditOpen(true)} onMerge={() => setMergeOpen(true)}
          onRecommission={recommission} onDecommission={() => setDecommissionOpen(true)} onDelete={() => setDeleteOpen(true)}
          onMonitorStateChange={changeMonitorState}
        />
        <DetailTabs tabs={visibleTabs} active={activeTab} onChange={handleTabChange} />
      </div>

      {/* La tab activa llena el alto restante (rediseño sin scroll, 27/08/2026). */}
      <div className="flex min-h-0 flex-1 flex-col">
      {activeTab === 'general' && (
        <GeneralTab
          device={device} extra={extra} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages}
          counters={counters} activeAlerts={activeAlerts} allAlerts={alerts}
          trend={trend} trendLoading={trendLoading} trendError={trendError} onRetryTrend={refetchTrend}
        />
      )}
      {activeTab === 'counters' && <CountersTab device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />}
      {activeTab === 'supplies' && <SuppliesTable device={device} supplyRows={supplyRows} onOpenSupply={(key) => setSupplyTarget({ deviceId: device.id, supplyKey: key })} />}
      {activeTab === 'media' && <MediaTab inputTrays={details?.inputTrays} outputTrays={details?.outputTrays} />}
      {activeTab === 'alerts' && <AlertsTab activeAlerts={activeAlerts} />}
      {activeTab === 'incidents' && <IncidentsTab incidents={incidents.data} incidentsLoading={incidents.loading} />}
      {activeTab === 'costs' && canSeeHistory && <CostsTab deviceId={id!} />}
      {activeTab === 'history' && canSeeHistory && <HistoryTab history={history.data} historyLoading={history.loading} />}
      </div>

      <ConfirmationModal
        isOpen={deleteOpen} onClose={() => { if (!deleting) setDeleteOpen(false); }} onConfirm={handleDelete}
        title="Eliminar dispositivo" variant="destructive" confirmLabel="Eliminar" loading={deleting} error={deleteError}
      >
        Se eliminará <strong>{device.model ?? 'el dispositivo'}</strong> ({device.serial_number ?? device.ip_address}) junto con todo su historial de lecturas y alertas. Esta acción no se puede deshacer.
      </ConfirmationModal>

      <EditDeviceModal
        isOpen={editOpen} onClose={() => setEditOpen(false)} onSaved={refetch}
        deviceId={device.id} currentName={device.name} currentLocation={device.location ?? null}
        reportedName={device.name_reported ?? null} reportedLocation={device.location_reported ?? null}
        currentAssetNumber={device.asset_number_override ?? null} currentAssetTag={device.asset_tag ?? null}
        currentDutyCycle={device.duty_cycle_monthly_override ?? null} customFieldDefs={customFieldDefs}
        currentCustomData={typeof device.custom_data === 'string' ? JSON.parse(device.custom_data) : (device.custom_data as Record<string, unknown> | null)}
      />
      <DecommissionDeviceModal isOpen={decommissionOpen} onClose={() => setDecommissionOpen(false)} onDone={refetch} deviceId={device.id} />
      <MoveDeviceModal isOpen={moveOpen} onClose={() => setMoveOpen(false)} onDone={refetch} deviceId={device.id} currentClientId={device.client_id ?? null} currentAgentId={device.agent_id ?? null} />
      <MergeDeviceModal isOpen={mergeOpen} onClose={() => setMergeOpen(false)} onDone={refetch} deviceId={device.id} clientId={device.client_id ?? null} />
      <SupplyDetailModal target={supplyTarget} onClose={() => setSupplyTarget(null)} />
    </div>
  );
};

export default DeviceDetail;
