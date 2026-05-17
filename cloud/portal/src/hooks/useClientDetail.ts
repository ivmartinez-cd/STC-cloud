import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Client, Monitor, UsageMonth, CreateMonitorForm } from '../types/monitor';

export function useClientDetail(id: string) {
  const [client, setClient] = useState<Client | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [usage, setUsage] = useState<UsageMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Client>(`/clients/${id}`),
      api.get<Monitor[]>(`/clients/${id}/monitors`),
      api.get<UsageMonth[]>(`/clients/${id}/usage`),
    ])
      .then(([c, m, u]) => {
        setClient(c);
        setMonitors(Array.isArray(m) ? m : []);
        setUsage(Array.isArray(u) ? u : []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createMonitor = useCallback(async (form: CreateMonitorForm): Promise<string> => {
    const payload: {
      clientId: string;
      name: string;
      snmp_community: string;
      scan_interval_minutes: number;
      ip_ranges?: Array<{ start: string; end: string }>;
    } = {
      clientId: id,
      name: form.name,
      snmp_community: form.snmp_community,
      scan_interval_minutes: form.scan_interval_minutes,
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

  return { client, monitors, usage, loading, error, refetch: fetchData, createMonitor, deleteMonitor };
}
