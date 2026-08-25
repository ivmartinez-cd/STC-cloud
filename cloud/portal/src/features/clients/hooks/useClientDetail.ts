import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../shared/lib/api';
import type { Client, Monitor, UsageMonth, CreateMonitorForm } from '../../../shared/types/monitor';
import type { ClientDetailStats } from '../types/clientDetail';

export function useClientDetail(id: string) {
  const [client, setClient] = useState<Client | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [usage, setUsage] = useState<UsageMonth[]>([]);
  const [stats, setStats] = useState<ClientDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Handoff hifi "Cliente — detalle" (25/08/2026): la tira de 6 métricas necesita
  // `stats` (managed_device_count/alertas) aparte de `client` — falla independiente,
  // sin bloquear el resto del bloque de identidad si el endpoint nuevo se cae.
  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Client>(`/clients/${id}`),
      api.get<Monitor[]>(`/clients/${id}/monitors`),
      api.get<UsageMonth[]>(`/clients/${id}/usage`),
      api.get<ClientDetailStats>(`/clients/${id}/stats`).catch(() => null),
    ])
      .then(([c, m, u, s]) => {
        setClient(c);
        setMonitors(Array.isArray(m) ? m : []);
        setUsage(Array.isArray(u) ? u : []);
        setStats(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const init = async () => {
      await fetchData();
    };
    void init();
  }, [fetchData]);

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
