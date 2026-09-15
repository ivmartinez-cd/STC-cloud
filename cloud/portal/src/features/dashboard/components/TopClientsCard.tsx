import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

/** "Cuentas por equipos" del rediseño "V1 Compacta" (handoff 14/09/2026):
 * barra tipo "lollipop" (línea + punto) por cuenta en vez de la barra
 * horizontal rellena que tenía antes, con el total de dispositivos/cuentas
 * como pie de tarjeta. Mismo dato que "Top cuentas por equipos". */
export default function TopClientsCard({
  topClients, totalClients, totalDevices, loading, error, onRetry,
}: {
  topClients: DashboardData['topClients'] | undefined;
  totalClients?: number;
  totalDevices?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = (topClients ?? []).slice(0, 5);
  const max = rows[0]?.device_count ?? 0;

  return (
    <SdsPanel title="Cuentas por equipos" headerClassName="px-[18px] py-[14px]">
      <div className="px-[18px] pb-[15px] pt-3.5">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <SkeletonBlock heightPx={12} widthPct={60 - (i % 2) * 12} />
                <SkeletonBlock heightPx={2} widthPct={70} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((c) => {
              const pct = Math.max(4, max > 0 ? (c.device_count / max) * 100 : 0);
              return (
                <Link key={c.id} to={`/clients/${c.id}`} className="group flex flex-col gap-[7px] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-sans text-[13px] leading-[1.2] text-ink-700 group-hover:text-brand-accent">{c.name}</span>
                    <span className="shrink-0 font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt(c.device_count)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="block h-[2px] rounded-full bg-line-300" style={{ width: `${pct}%` }} />
                    <span className="-ml-1 block h-[9px] w-[9px] shrink-0 rounded-full bg-ink-600" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {!error && !loading && totalDevices != null && totalClients != null && (
          <div className="mt-3.5 border-t border-line-150 pt-2.5 font-sans text-[11px] text-ink-300">
            {fmt(totalDevices)} dispositivos en {fmt(totalClients)} cuentas
          </div>
        )}
      </div>
    </SdsPanel>
  );
}
