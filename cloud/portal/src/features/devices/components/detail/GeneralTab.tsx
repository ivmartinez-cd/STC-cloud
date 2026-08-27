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

/** "Vista general" (handoff hifi "Dispositivo — detalle", 25/08/2026): las
 * mismas 5 tarjetas, ahora en UNA fila de 4 columnas (alertas y tendencia
 * apiladas en la tercera) para que entren en el alto que deja la tarjeta de
 * identidad sin scroll (27/08/2026) — antes eran 2 bandas y la segunda
 * quedaba fuera de pantalla. */
export default function GeneralTab({
  device, extra, latest, totalPages, monoPages, colorPages, counters,
  activeAlerts, allAlerts, trend, trendLoading, trendError, onRetryTrend,
}: GeneralTabProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      <DeviceIdentityCard device={device} />
      <DeviceSpecsCard device={device} extra={extra} />
      <div className="flex min-h-0 flex-col gap-4">
        <DeviceAlertsCard activeAlerts={activeAlerts} allAlerts={allAlerts} deviceId={device.id} />
        <PrintTrendCard trend={trend} loading={trendLoading} error={trendError} onRetry={onRetryTrend} />
      </div>
      <CurrentCountersCard device={device} latest={latest} totalPages={totalPages} monoPages={monoPages} colorPages={colorPages} counters={counters} />
    </div>
  );
}
