import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/lib/api';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import { OFFLINE_THRESHOLD_MS } from '../../../shared/lib/constants';
import { parseSuppliesDetails, buildSupplyRows, usageRate, type SupplyRow } from '../../../shared/lib/supplies';
import type { Alert } from '../../../shared/types/alerts';
import type { CustomFieldDef } from '../../../shared/types/inventory';
import type { ActiveAlertItem, DeviceDetailData, Reading } from '../types/deviceDetailPage';

function dedupeActiveAlerts(device: DeviceDetailData | null, alerts: Alert[], deviceId: string): ActiveAlertItem[] {
  const details = parseSuppliesDetails(device?.supplies_details);
  const seen = new Set<string>();
  const out: ActiveAlertItem[] = [];
  for (const a of details?.alerts ?? []) {
    const key = `${a.code ?? ''}|${(a.description ?? '').toLowerCase()}`;
    if (!a.description && !a.code) continue;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ key: `dev-${key}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.description ?? a.code ?? '', code: a.code, time: a.time });
  }
  for (const a of alerts.filter(x => !x.resolved && x.device_id === deviceId)) {
    const key = `${(a.type ?? '').toLowerCase()}|${(a.message ?? '').toLowerCase()}`;
    if (seen.has(key) || [...seen].some(k => k.endsWith(`|${(a.message ?? '').toLowerCase()}`))) continue; seen.add(key);
    out.push({ key: `srv-${a.id}`, severity: (a.severity ?? 'INFO').toUpperCase(), message: a.message, code: a.type, time: a.created_at, alertClass: a.alert_class });
  }
  return out;
}

/** Campos personalizados del cliente dueño — sólo para renderizar el valor
 * guardado en `device.custom_data`; se pide una vez que se conoce `clientId`. */
function useCustomFieldDefs(clientId: string | undefined) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  useEffect(() => {
    if (!clientId) return;
    api.get<CustomFieldDef[]>(`/clients/${clientId}/custom-fields`).then(setDefs).catch(() => setDefs([]));
  }, [clientId]);
  return defs;
}

/** Editar/Fusionar/Mover viven en sus propios modales (llaman a la API
 * directo); acá sólo lo que dispara el header sin abrir un modal. */
function useDeviceLifecycleActions(id: string, load: () => void) {
  const navigate = useNavigate();
  const [changingMonitorState, setChangingMonitorState] = useState(false);
  const [recommissioning, setRecommissioning] = useState(false);

  // `replace`: "atrás" no vuelve a la ficha recién borrada (404); `returnTo` = `?from=` validado de la ficha.
  const deleteDevice = useCallback(async (returnTo?: string) => { await api.delete(`/devices/${id}`); navigate(returnTo ?? '/devices', { replace: true }); }, [id, navigate]);
  const recommission = useCallback(async () => {
    setRecommissioning(true);
    try { await api.post(`/devices/${id}/recommission`, {}); await load(); } finally { setRecommissioning(false); }
  }, [id, load]);
  const changeMonitorState = useCallback(async (state: string) => {
    setChangingMonitorState(true);
    try { await api.put(`/devices/${id}/monitor-state`, { state }); await load(); } finally { setChangingMonitorState(false); }
  }, [id, load]);

  return { deleteDevice, recommission, recommissioning, changeMonitorState, changingMonitorState };
}

/** Derivados puros de consumibles/alertas/estado — mismos cálculos que antes
 * vivían inline en `DeviceDetail.tsx` (`shared/lib/supplies`, dedup de alertas). */
function useDeviceDerived(device: DeviceDetailData | null, readings: Reading[], alerts: Alert[], id: string) {
  const details = useMemo(() => parseSuppliesDetails(device?.supplies_details), [device?.supplies_details]);
  const rate = useMemo(() => usageRate(readings), [readings]);
  const supplyRows: SupplyRow[] = useMemo(() => (device ? buildSupplyRows(device, details, rate) : []), [device, details, rate]);
  const activeAlerts = useMemo(() => dedupeActiveAlerts(device, alerts, id), [device, alerts, id]);
  const isAgentOnline = device !== null && device.agent_status === 'active' && !!device.agent_last_seen
    && (Date.now() - new Date(device.agent_last_seen).getTime() <= OFFLINE_THRESHOLD_MS);
  return { details, rate, supplyRows, activeAlerts, isAgentOnline };
}

/** Equipo + lecturas (400, ~1 semana) + alertas del equipo, en paralelo. */
async function fetchDeviceDetailData(id: string) {
  const [device, readings, alerts] = await Promise.all([
    api.get<DeviceDetailData>(`/devices/${id}`),
    api.get<Reading[]>(`/devices/${id}/readings?limit=400`),
    api.get<Alert[]>(`/alerts?device_id=${id}`).catch(() => [] as Alert[]),
  ]);
  return { device, readings: Array.isArray(readings) ? readings : [], alerts: Array.isArray(alerts) ? alerts : [] };
}

type DetailSetters = {
  setDevice: (v: DeviceDetailData) => void;
  setReadings: (v: Reading[]) => void;
  setAlerts: (v: Alert[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
};

/** `isLatest` descarta la respuesta de un request ya superado (refetch manual
 * cruzado con otro, o una respuesta que llega tras salir de la pantalla).
 * `setError('')` al empezar: sin eso, una falla transitoria dejaba la ficha en
 * error para siempre aunque el reintento anduviera. */
async function loadDeviceDetail(id: string, st: DetailSetters, isLatest: () => boolean) {
  st.setLoading(true);
  st.setError('');
  try {
    const r = await fetchDeviceDetailData(id);
    if (!isLatest()) return;
    st.setDevice(r.device); st.setReadings(r.readings); st.setAlerts(r.alerts);
  } catch (e: unknown) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

function useDeviceDetailLoader(id: string) {
  const [device, setDevice] = useState<DeviceDetailData | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const beginRequest = useLatestRequest();
  const load = useCallback(() => {
    void loadDeviceDetail(id, { setDevice, setReadings, setAlerts, setLoading, setError }, beginRequest());
  }, [id, beginRequest]);

  useEffect(() => { void load(); }, [load]);
  return { device, readings, alerts, loading, error, load };
}

/** Carga + mutaciones de ciclo de vida del detalle de Dispositivo (handoff
 * hifi "Dispositivo — detalle", 25/08/2026) — mismo criterio que
 * `useClientDetail`/`useMonitorDetail`: absorbe lo que antes vivía inline en
 * la página para que ésta quede como composición. */
export function useDeviceDetail(id: string) {
  const { device, readings, alerts, loading, error, load } = useDeviceDetailLoader(id);
  const customFieldDefs = useCustomFieldDefs(device?.client_id);
  const lifecycle = useDeviceLifecycleActions(id, load);
  const derived = useDeviceDerived(device, readings, alerts, id);
  return { device, readings, alerts, loading, error, refetch: load, customFieldDefs, ...derived, ...lifecycle };
}
