import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SectionHead from './SectionHead';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt } from '../../../shared/lib/formatters';

type ClientRow = NonNullable<DashboardData['topClients']>[number];

/** La barra es el peso de la cuenta sobre el TOTAL del parque (no sobre la
 * cuenta más grande, como en las otras dos columnas): acá la pregunta es qué
 * tajada del parque tiene cada cliente. */
function Row({ client, totalDevices }: { client: ClientRow; totalDevices: number }) {
  return (
    <Link to={`/clients/${client.id}`} className="group block border-b border-line-200 py-3 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-sans text-[14px] text-ink-900 group-hover:text-brand-accent">{client.name}</span>
        <span className="shrink-0 font-mono text-[14px] tabular-nums text-ink-900">{fmt(client.device_count)}</span>
      </div>
      <MiniBar pct={totalDevices > 0 ? (client.device_count / totalDevices) * 100 : 0} minPct={2} height={4} radius={0} color="var(--color-ink-700)" className="mt-2" />
    </Link>
  );
}

/** "Cuentas por equipos" del rediseño minimalista (handoff "Panel de
 * control", 16/09/2026): nombre + cifra mono sobre una barra fina con el
 * porcentaje del parque, y el total como pie de sección. Reemplaza el
 * "lollipop" (línea + punto) del rediseño anterior. */
export default function AccountsSection({
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

  return (
    <section>
      <SectionHead title="Cuentas por equipos" />
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-line-200 py-3">
            <SkeletonBlock heightPx={12} widthPct={60 - (i % 2) * 12} />
            <MiniBar pct={0} height={4} radius={0} />
          </div>
        ))
      ) : rows.length === 0 ? (
        <CardEmpty />
      ) : (
        rows.map((c) => <Row key={c.id} client={c} totalDevices={totalDevices ?? 0} />)
      )}
      {!error && !loading && totalDevices != null && totalClients != null && (
        <div className="mt-2.5 font-sans text-[12px] text-ink-400">
          {fmt(totalDevices)} dispositivos en {fmt(totalClients)} cuentas
        </div>
      )}
    </section>
  );
}
