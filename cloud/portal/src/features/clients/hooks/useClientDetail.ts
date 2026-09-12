import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../shared/lib/api';
import { useLatestRequest } from '../../../shared/hooks/useLatestRequest';
import type { Client, Monitor, UsageMonth, CreateMonitorForm } from '../../../shared/types/monitor';
import type { ClientDetailStats } from '../types/clientDetail';

type ClientSetters = {
  setClient: (v: Client) => void;
  setMonitors: (v: Monitor[]) => void;
  setUsage: (v: UsageMonth[]) => void;
  setStats: (v: ClientDetailStats | null) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
};

// Handoff hifi "Cliente — detalle" (25/08/2026): la tira de 6 métricas necesita
// `stats` (managed_device_count/alertas) aparte de `client` — falla independiente,
// sin bloquear el resto del bloque de identidad si el endpoint nuevo se cae.
async function fetchClientDetailData(id: string) {
  const [client, monitors, usage, stats] = await Promise.all([
    api.get<Client>(`/clients/${id}`),
    api.get<Monitor[]>(`/clients/${id}/monitors`),
    api.get<UsageMonth[]>(`/clients/${id}/usage`),
    api.get<ClientDetailStats>(`/clients/${id}/stats`).catch(() => null),
  ]);
  return {
    client,
    monitors: Array.isArray(monitors) ? monitors : [],
    usage: Array.isArray(usage) ? usage : [],
    stats,
  };
}

/** `isLatest` descarta la respuesta de un request superado (dos refetch seguidos
 * tras crear/borrar un monitor); `setError('')` al empezar evita que una falla
 * transitoria deje la ficha en error para siempre. */
async function loadClientDetail(id: string, st: ClientSetters, isLatest: () => boolean) {
  st.setLoading(true);
  st.setError('');
  try {
    const r = await fetchClientDetailData(id);
    if (!isLatest()) return;
    st.setClient(r.client);
    st.setMonitors(r.monitors);
    st.setUsage(r.usage);
    st.setStats(r.stats);
  } catch (e: unknown) {
    if (isLatest()) st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    if (isLatest()) st.setLoading(false);
  }
}

export function useClientDetail(id: string) {
  const [client, setClient] = useState<Client | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [usage, setUsage] = useState<UsageMonth[]>([]);
  const [stats, setStats] = useState<ClientDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const beginRequest = useLatestRequest();
  const fetchData = useCallback(() => {
    void loadClientDetail(id, { setClient, setMonitors, setUsage, setStats, setLoading, setError }, beginRequest());
  }, [id, beginRequest]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createMonitor = useCallback(async (form: CreateMonitorForm): Promise<string> => {
    const payload: {
      clientId: string;
      name: string;
      snmp_community: string;
      ip_ranges?: Array<{ start: string; end: string }>;
    } = {
      clientId: id,
      name: form.name,
      snmp_community: form.snmp_community,
    };
    if (form.ipStart && form.ipEnd) {
      payload.ip_ranges = [{ start: form.ipStart, end: form.ipEnd }];
    }
    const result = await api.post<{ key?: string; activationKey?: string; activation_key?: string }>('/agents', payload);
    fetchData();
    return result.key || result.activationKey || result.activation_key || '';
  }, [id, fetchData]);

  const deleteMonitor = useCallback(async (monitorId: string) => {
    await api.delete(`/agents/${monitorId}`);
    fetchData();
  }, [fetchData]);

  const updateNotifications = useCallback(async (fields: { notification_email: string; notification_webhook_url: string }) => {
    const updated = await api.put<Client>(`/clients/${id}`, fields);
    setClient(updated);
  }, [id]);

  const updateDeviceApprovalRequired = useCallback(async (value: boolean) => {
    const updated = await api.put<Client>(`/clients/${id}`, { device_approval_required: value });
    setClient(updated);
  }, [id]);

  /** "EDITAR CLIENTE" del header de identidad — mismos campos que el alta en `Clients.tsx`. */
  const updateClientProfile = useCallback(async (fields: {
    name: string; contact_name: string; contact_phone: string; contact_email: string; address: string; country: string;
  }) => {
    const updated = await api.put<Client>(`/clients/${id}`, fields);
    setClient(updated);
  }, [id]);

  return {
    client, monitors, usage, stats, loading, error, refetch: fetchData,
    createMonitor, deleteMonitor, updateNotifications, updateDeviceApprovalRequired, updateClientProfile,
  };
}
