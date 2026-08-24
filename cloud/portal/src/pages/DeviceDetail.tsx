import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Activity, Layers, AlertTriangle, Inbox, TrendingUp, History, AlertOctagon } from 'lucide-react';
import { OFFLINE_THRESHOLD_MS } from '../lib/constants';
import type { SuppliesDetails } from '../types/monitor';
import type { Alert } from '../types/alerts';
import type { AuditLogItem, AuditLogsResponse } from '../types/audit';
import type { CustomFieldDef } from '../types/inventory';
import type { Incident, IncidentListResponse } from '../types/incidents';
import { parseSuppliesDetails, buildSupplyRows, usageRate, type SupplyRow } from '../lib/supplies';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { EditDeviceModal, DecommissionDeviceModal, MoveDeviceModal, MergeDeviceModal } from '../components/devices/DeviceLifecycleModals';
import DeviceDetailHeader from '../components/devices/detail/DeviceDetailHeader';
import DeviceStatusBanners from '../components/devices/detail/DeviceStatusBanners';
import GeneralTab from '../components/devices/detail/GeneralTab';
import CountersTab from '../components/devices/detail/CountersTab';
import SuppliesTable from '../components/devices/detail/SuppliesTable';
import MediaTab from '../components/devices/detail/MediaTab';
import AlertsTab from '../components/devices/detail/AlertsTab';
import IncidentsTab from '../components/devices/detail/IncidentsTab';
import HistoryTab from '../components/devices/detail/HistoryTab';
import { useAuth } from '../context/AuthContext';
import type { ActiveAlertItem, DeviceDetailData, DeviceDetailTab, Reading } from '../types/deviceDetailPage';

const DeviceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [device, setDevice]     = useState<DeviceDetailData | null>(null);
  const [alerts, setAlerts]     = useState<Alert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [now] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<DeviceDetailTab>('general');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [decommissionOpen, setDecommissionOpen] = useState(false);
  const [recommissioning, setRecommissioning] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  // Historial (audit_logs) — 403 para client_viewer, así que se pide sólo al
  // abrir la pestaña (no en el Promise.all inicial) y sólo si el rol la puede ver.
  const [history, setHistory] = useState<AuditLogItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const canSeeHistory = role === 'admin' || role === 'operator';
  // Campos personalizados (Fase 4) — sólo labels/tipos para renderizar el
  // valor guardado en device.custom_data; se fetchea una vez que se conoce
  // el client_id del equipo.
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  // Incidentes (Fase 11 del gap analysis vs HP SDS) — mismo criterio lazy que el historial.
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<DeviceDetailData>(`/devices/${id}`),
      // 400 lecturas alcanzan para ~1 semana de historial con los loops actuales → ritmo de impresión real
      api.get<Reading[]>(`/devices/${id}/readings?limit=400`),
      api.get<Alert[]>(`/alerts?device_id=${id}`).catch(() => [] as Alert[]),
    ])
      .then(([deviceData, readingsData, alertsData]) => {
        setDevice(deviceData);
        setReadings(Array.isArray(readingsData) ? readingsData : []);
        setAlerts(Array.isArray(alertsData) ? alertsData : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!device?.client_id) return;
    api.get<CustomFieldDef[]>(`/clients/${device.client_id}/custom-fields`)
      .then(setCustomFieldDefs)
      .catch(() => setCustomFieldDefs([]));
  }, [device?.client_id]);

  useEffect(() => {
    if (activeTab !== 'history' || history !== null || !canSeeHistory || !id) return;
    setHistoryLoading(true);
    api.get<AuditLogsResponse>(`/audit-logs?target_id=${id}&limit=50`)
      .then((data) => setHistory(data.items))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [activeTab, history, canSeeHistory, id]);

  useEffect(() => {
    if (activeTab !== 'incidents' || incidents !== null || !id) return;
    setIncidentsLoading(true);
    api.get<IncidentListResponse>(`/incidents?device_id=${id}&limit=50`)
      .then((data) => setIncidents(data.items))
      .catch(() => setIncidents([]))
      .finally(() => setIncidentsLoading(false));
  }, [activeTab, incidents, id]);

  const latest = readings[0] ?? null;
  const details: SuppliesDetails | null = useMemo(() => parseSuppliesDetails(device?.supplies_details), [device?.supplies_details]);
  const rate = useMemo(() => usageRate(readings), [readings]);
  const supplyRows: SupplyRow[] = useMemo(() => (device ? buildSupplyRows(device, details, rate) : []), [device, details, rate]);
  const counters = details?.counters;
  const extra = details?.device;

  const chartData = useMemo(() => [...readings].slice(0, 48).reverse().map(r => ({
    time:  new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Total: r.total_pages ?? 0,
    Mono:  r.mono_pages ?? 0,
    Color: r.color_pages ?? 0,
  })), [readings]);

  const isAgentOnline = device !== null
    && device.agent_status === 'active'
    && !!device.agent_last_seen
    && (now - new Date(device.agent_last_seen).getTime() <= OFFLINE_THRESHOLD_MS);

  const handleDelete = async () => {
    setDeleting(true); setDeleteError(null);
    try {
      await api.delete(`/devices/${id}`);
      navigate('/devices');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleRecommission = async () => {
    setRecommissioning(true);
    try {
      await api.post(`/devices/${id}/recommission`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecommissioning(false);
    }
  };

  const [changingMonitorState, setChangingMonitorState] = useState(false);
  const handleMonitorStateChange = async (state: string) => {
    if (!device || state === device.monitor_state) return;
    setChangingMonitorState(true);
    try {
      await api.put(`/devices/${id}/monitor-state`, { state });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChangingMonitorState(false);
    }
  };

  const totalPages = latest?.total_pages ?? device?.total_pages ?? null;
  const monoPages  = latest?.mono_pages  ?? device?.mono_pages  ?? null;
  const colorPages = latest?.color_pages ?? device?.color_pages ?? null;
  const isColorDevice = (colorPages ?? 0) > 0 || supplyRows.some(r => r.kind === 'Tóner' && r.color !== 'Negro');

  // Alertas activas: del servidor + las que reporta el equipo (supplies_details.alerts), deduplicadas
  const activeAlerts: ActiveAlertItem[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ActiveAlertItem[] = [];
    for (const a of details?.alerts ?? []) {
      const key = `${a.code ?? ''}|${(a.description ?? '').toLowerCase()}`;
      if (!a.description && !a.code) continue;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ key: `dev-${key}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.description ?? a.code ?? '', code: a.code, time: a.time });
    }
    for (const a of alerts.filter(x => !x.resolved && x.device_id === id)) {
      const key = `${(a.type ?? '').toLowerCase()}|${(a.message ?? '').toLowerCase()}`;
      if (seen.has(key) || [...seen].some(k => k.endsWith(`|${(a.message ?? '').toLowerCase()}`))) continue; seen.add(key);
      out.push({ key: `srv-${a.id}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.message, code: a.type, time: a.created_at });
    }
    return out;
  }, [details?.alerts, alerts, id]);

  const tabBtn = (tab: DeviceDetailTab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
        activeTab === tab ? 'bg-white text-brand border border-slate-200 shadow-xs border-b-2 border-b-brand' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
      }`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DeviceDetailHeader
        device={device} role={role} loading={loading} changingMonitorState={changingMonitorState} recommissioning={recommissioning}
        onRefresh={load} onMonitorStateChange={handleMonitorStateChange}
        onEdit={() => setEditOpen(true)} onMove={() => setMoveOpen(true)} onMerge={() => setMergeOpen(true)}
        onRecommission={handleRecommission} onDecommission={() => setDecommissionOpen(true)} onDelete={() => setDeleteOpen(true)}
      />

      {device && <DeviceStatusBanners device={device} />}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        {tabBtn('general', <Layers size={15} />, 'Vista General')}
        {tabBtn('counters', <TrendingUp size={15} />, 'Recuentos')}
        {tabBtn('supplies', <Activity size={15} />, 'Consumibles')}
        {tabBtn('media', <Inbox size={15} />, 'Medios (Bandejas)')}
        {tabBtn('alerts', <AlertTriangle size={15} />, `Alertas${activeAlerts.length ? ` (${activeAlerts.length})` : ''}`)}
        {tabBtn('incidents', <AlertOctagon size={15} />, 'Incidentes')}
        {canSeeHistory && tabBtn('history', <History size={15} />, 'Historial')}
      </div>

      {error && <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-600 font-bold">Error: {error}</div>}

      {!error && device && activeTab === 'general' && (
        <GeneralTab
          device={device} isAgentOnline={isAgentOnline} extra={extra} customFieldDefs={customFieldDefs}
          readingsCount={readings.length} chartData={chartData} isColorDevice={isColorDevice} rate={rate}
          totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} latest={latest}
          counters={counters} supplyRows={supplyRows} activeAlerts={activeAlerts}
        />
      )}

      {!error && device && activeTab === 'counters' && (
        <CountersTab device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />
      )}

      {!error && device && activeTab === 'supplies' && <SuppliesTable device={device} supplyRows={supplyRows} rate={rate} />}

      {!error && device && activeTab === 'media' && <MediaTab inputTrays={details?.inputTrays} outputTrays={details?.outputTrays} />}

      {!error && device && activeTab === 'alerts' && <AlertsTab activeAlerts={activeAlerts} />}

      {!error && device && activeTab === 'incidents' && <IncidentsTab incidents={incidents} incidentsLoading={incidentsLoading} />}

      {!error && device && activeTab === 'history' && canSeeHistory && <HistoryTab history={history} historyLoading={historyLoading} />}

      <ConfirmationModal
        isOpen={deleteOpen}
        onClose={() => { if (!deleting) setDeleteOpen(false); }}
        onConfirm={handleDelete}
        title="Eliminar dispositivo"
        variant="destructive"
        confirmLabel="Eliminar"
        loading={deleting}
        error={deleteError}
      >
        Se eliminará <strong>{device?.model ?? 'el dispositivo'}</strong> ({device?.serial_number ?? device?.ip_address}) junto con todo su historial de lecturas y alertas. Esta acción no se puede deshacer.
      </ConfirmationModal>

      {device && (
        <>
          <EditDeviceModal
            isOpen={editOpen} onClose={() => setEditOpen(false)} onSaved={load}
            deviceId={device.id} currentName={device.name} currentLocation={device.location ?? null}
            reportedName={device.name_reported ?? null} reportedLocation={device.location_reported ?? null}
            currentAssetNumber={device.asset_number_override ?? null}
            currentAssetTag={device.asset_tag ?? null}
            currentDutyCycle={device.duty_cycle_monthly_override ?? null}
            customFieldDefs={customFieldDefs}
            currentCustomData={typeof device.custom_data === 'string' ? JSON.parse(device.custom_data) : (device.custom_data as Record<string, unknown> | null)}
          />
          <DecommissionDeviceModal
            isOpen={decommissionOpen} onClose={() => setDecommissionOpen(false)} onDone={load} deviceId={device.id}
          />
          <MoveDeviceModal
            isOpen={moveOpen} onClose={() => setMoveOpen(false)} onDone={load} deviceId={device.id}
            currentClientId={device.client_id ?? null} currentAgentId={device.agent_id ?? null}
          />
          <MergeDeviceModal
            isOpen={mergeOpen} onClose={() => setMergeOpen(false)} onDone={load} deviceId={device.id}
            clientId={device.client_id ?? null}
          />
        </>
      )}
    </div>
  );
};

export default DeviceDetail;
