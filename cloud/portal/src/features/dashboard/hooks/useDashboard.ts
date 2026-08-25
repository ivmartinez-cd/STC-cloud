import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../../shared/lib/api';
import { useToast } from '../../../store/ToastContext';
import { DASHBOARD_POLL_MS } from '../../../shared/lib/constants';
import type { DashboardData } from '../../../shared/types/monitor';

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNextRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    try {
      const res = await api.get<DashboardData>('/dashboard');
      setData(res);
    } catch {
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

  return { data, loading, fetchDashboardData: load };
}
