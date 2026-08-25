import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt } from '../../../shared/lib/formatters';

/** "Top cuentas por equipos" del handoff hifi: índice, cliente, barra
 * relativa al máximo y cantidad de equipos — cada fila navega al detalle del
 * cliente. */
export default function TopClientsCard({
  topClients, totalClients, loading, error, onRetry,
}: {
  topClients: DashboardData['topClients'] | undefined;
  totalClients?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = topClients ?? [];
  const max = rows[0]?.device_count ?? 0;

  return (
    <SdsPanel
      title="Top cuentas por equipos"
      headerClassName="px-[18px] py-[14px]"
      headerRight={!loading && !error && totalClients != null ? <span className="font-sans text-[11px] text-ink-300">{fmt(totalClients)} clientes</span> : undefined}
    >
      <div className="px-[18px] pb-[13px] pt-3">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid grid-cols-[14px_1fr_78px_44px] items-center gap-2.5 border-b border-line-200 py-[7px]">
              <SkeletonBlock heightPx={10} />
              <SkeletonBlock heightPx={10} widthPct={70 - (i % 3) * 10} />
              <MiniBar pct={0} height={6} radius={3} />
              <SkeletonBlock heightPx={10} widthPct={80} className="ml-auto" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          rows.slice(0, 5).map((c, i) => {
            const pct = Math.max(3, max > 0 ? (c.device_count / max) * 100 : 0);
            return (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="grid grid-cols-[14px_1fr_78px_44px] items-center gap-2.5 border-b border-line-200 py-[7px] transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
              >
                <span className="font-montserrat text-[10px] font-semibold tabular-nums text-ink-200">{i + 1}</span>
                <span className="truncate font-sans text-[12px] leading-[1.2] text-ink-700">{c.name}</span>
                <span className="block h-1.5 rounded-[3px] bg-surface-track">
                  <span className="block h-full rounded-[3px] bg-brand-gray" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-right font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt(c.device_count)}</span>
              </Link>
            );
          })
        )}
      </div>
    </SdsPanel>
  );
}
