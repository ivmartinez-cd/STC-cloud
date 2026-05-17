import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { DASHBOARD_POLL_MS } from '../lib/constants';
import type { DashboardData } from '../types/monitor';

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        load().finally(scheduleNext);
      } else {
        scheduleNext();
      }
    }, DASHBOARD_POLL_MS);
  }, [load]);

  useEffect(() => {
    load().finally(scheduleNext);

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

  return { data, loading };
}
