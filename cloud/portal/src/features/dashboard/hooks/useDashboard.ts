import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { DASHBOARD_POLL_MS } from '../../../shared/lib/constants';
import type { DashboardData } from '../../../shared/types/monitor';

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  /** Refleja el último poll: `false` mientras el chip de cabecera pueda decir
   * "SINCRONIZADO hh:mm"; `true` cuando debe pasar a "SIN SINCRONIZAR". */
  const [error, setError] = useState(false);
  /** Momento del último poll exitoso — sostiene el chip de sincronización y,
   * si `data` ya existe, evita que un poll fallido vuelva a mostrar skeletons:
   * cada tarjeta sigue con los últimos números buenos hasta el próximo poll OK. */
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const { showToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNextRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    try {
      const res = await api.get<DashboardData>('/dashboard');
      setData(res);
      setLastSyncAt(new Date());
      setError(false);
    } catch {
      setError(true);
      showToast('Error al actualizar panel global', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        load().finally(() => scheduleNextRef.current());
      } else {
        scheduleNextRef.current();
      }
    }, DASHBOARD_POLL_MS);
  }, [load]);

  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  useEffect(() => {
    const init = async () => {
      await load();
      scheduleNext();
    };
    void init();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current);
        load().finally(scheduleNext);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load, scheduleNext]);

  return { data, loading, error, lastSyncAt, fetchDashboardData: load };
}
