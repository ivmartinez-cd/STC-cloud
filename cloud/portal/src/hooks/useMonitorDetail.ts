import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { MonitorData, Device, EditFormData } from '../types/monitor';

const POLL_INTERVAL_MS = 45_000;

export function useMonitorDetail(id: string) {
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDevices = useCallback(async () => {
    const data = await api.get<Device[]>(`/agents/${id}/devices`);
    setDevices(data);
  }, [id]);

  const fetchAll = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const data = await api.get<MonitorData>(`/agents/${id}`);
      setMonitor(data);
      await fetchDevices();
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message || 'Error al cargar datos del monitor');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [id, fetchDevices]);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        fetchAll().finally(scheduleNext);
      } else {
        scheduleNext();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchAll]);

  useEffect(() => {
    fetchAll(true).finally(scheduleNext);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current);
        fetchAll().finally(scheduleNext);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchAll, scheduleNext]);

  const refetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    fetchAll().finally(scheduleNext);
  }, [fetchAll, scheduleNext]);

  const sendCommand = useCallback(async (action: string) => {
    try {
      setCommandLoading(action);
      await api.post(`/agents/${id}/command`, { type: action, payload: {} });
      showToast(`Comando ${action} encolado correctamente`, 'success');
    } catch (err: unknown) {
      showToast((err as Error).message || 'Error al enviar comando', 'error');
    } finally {
      setCommandLoading(null);
    }
  }, [id, showToast]);

  const saveConfig = useCallback(async (form: EditFormData) => {
    await api.put(`/agents/${id}/config`, {
      name: form.name,
      ip_ranges: form.ipStart && form.ipEnd ? [{ start: form.ipStart, end: form.ipEnd }] : [],
      snmp_community: form.snmp,
      scan_interval_minutes: form.interval,
    });
    showToast('Configuración actualizada correctamente', 'success');
    refetch();
  }, [id, showToast, refetch]);

  const regenerateKey = useCallback(async (): Promise<string> => {
    const data = await api.post<{ activation_key: string }>(`/agents/${id}/regenerate-key`);
    refetch();
    return data.activation_key;
  }, [id, refetch]);

  const revokeMonitor = useCallback(async () => {
    await api.post(`/agents/${id}/revoke`);
    showToast('Licencia revocada', 'success');
    navigate('/monitoring');
  }, [id, showToast, navigate]);

  return {
    monitor, devices, loading, error,
    commandLoading, sendCommand,
    saveConfig, regenerateKey, revokeMonitor,
    refetch, fetchDevices,
  };
}
