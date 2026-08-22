import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { MonitorData, Device, EditFormData, SnmpCredentialInput } from '../types/monitor';

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
  const scheduleNextRef = useRef<() => void>(() => {});

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
        fetchAll().finally(() => scheduleNextRef.current());
      } else {
        scheduleNextRef.current();
      }
    }, POLL_INTERVAL_MS);
  }, [fetchAll]);

  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  useEffect(() => {
    const init = async () => {
      await fetchAll(true);
      scheduleNext();
    };
    void init();

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
    const result = await api.put<{ warnings?: string[] }>(`/agents/${id}/config`, {
      name: form.name,
      ip_ranges: form.ip_ranges,
      snmp_community: form.snmp,
      toner_warning_threshold: form.tonerWarningThreshold,
      toner_critical_threshold: form.tonerCriticalThreshold,
    });
    showToast('Configuración actualizada correctamente', 'success');
    // Warnings NO bloqueantes de validateIpRangeSpecs (ej. rango con IP
    // pública) — el guardado ya se hizo, esto es sólo informativo.
    result?.warnings?.forEach(w => showToast(w, 'warning'));
    refetch();
  }, [id, showToast, refetch]);

  /**
   * Reemplaza TODA la lista de credenciales SNMP. Separado de `saveConfig` a
   * propósito (mismo criterio que el endpoint separado del lado cloud): así
   * el flujo de config general nunca necesita tocar material secreto.
   * Siempre refresca al final (éxito o error) — un 409 trae un `rev` nuevo
   * que el formulario necesita para el próximo intento, y `refetch()` lo trae
   * a través de `GET /agents/:id`. El error se relanza para que el panel lo
   * muestre (mensaje de validación, 409 de conflicto, o 503 sin clave
   * configurada del lado cloud).
   */
  const saveSnmpCredentials = useCallback(async (credentials: SnmpCredentialInput[], expectedRev: number) => {
    try {
      await api.put(`/agents/${id}/snmp-credentials`, { credentials, expected_rev: expectedRev });
      showToast('Credenciales SNMP actualizadas', 'success');
    } finally {
      refetch();
    }
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
    saveConfig, saveSnmpCredentials, regenerateKey, revokeMonitor,
    refetch, fetchDevices,
  };
}
