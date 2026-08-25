import DeviceIdentityCard from './DeviceIdentityCard';
import DeviceSpecsCard from './DeviceSpecsCard';
import DeviceAlertsCard from './DeviceAlertsCard';
import PrintTrendCard from './PrintTrendCard';
import CurrentCountersCard from './CurrentCountersCard';
import type { DetailedCounters, DeviceExtraInfo } from '../../../../shared/types/monitor';
import type { Alert } from '../../../../shared/types/alerts';
import type { ActiveAlertItem, DeviceDetailData, PrintTrend, Reading } from '../../types/deviceDetailPage';

interface GeneralTabProps {
  device: DeviceDetailData;
  extra: DeviceExtraInfo | undefined;
  latest: Reading | null;
  totalPages: number | null;
  monoPages: number | null;
  colorPages: number | null;
  counters: DetailedCounters | undefined;
  activeAlerts: ActiveAlertItem[];
  allAlerts: Alert[];
  trend: PrintTrend | null;
  trendLoading: boolean;
  trendError: boolean;
  onRetryTrend: () => void;
}

/** "Vista general" (handoff hifi "Dispositivo — detalle", 25/08/2026): 3
 * tarjetas (identificación, datos, alertas) + tendencia de 12 meses y
 * contadores actuales — reemplaza el mosaico foto/datos/gráfico anterior. */
export default function GeneralTab({
  device, extra, latest, totalPages, monoPages, colorPages, counters,
  activeAlerts, allAlerts, trend, trendLoading, trendError, onRetryTrend,
}: GeneralTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-4">
        <DeviceIdentityCard device={device} />
        <DeviceSpecsCard device={device} extra={extra} />
        <DeviceAlertsCard activeAlerts={activeAlerts} allAlerts={allAlerts} deviceId={device.id} />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-[1.5fr_1fr]">
        <PrintTrendCard trend={trend} loading={trendLoading} error={trendError} onRetry={onRetryTrend} />
        <CurrentCountersCard device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />
      </div>
    </div>
  );
}
