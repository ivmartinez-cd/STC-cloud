import { usePolledResource } from '../../../shared/hooks/usePolledResource';
import type { DeviceStats, PrintTrend } from '../types/deviceDetailPage';

/** Tira de 6 métricas — handoff hifi "Dispositivo — detalle" (25/08/2026), mismo patrón que `useMonitorStats`. */
export function useDeviceStats(deviceId: string) {
  const { data, loading, error, refetch } = usePolledResource<DeviceStats | null>(`/devices/${deviceId}/stats`, true, null);
  return { stats: data, loading, error, refetch };
}

/** "Tendencia de impresión · 12 meses" — cara de calcular, poll independiente del resto. */
export function useDevicePrintTrend(deviceId: string) {
  const { data, loading, error, refetch } = usePolledResource<PrintTrend | null>(`/devices/${deviceId}/print-trend`, true, null);
  return { trend: data, loading, error, refetch };
}
