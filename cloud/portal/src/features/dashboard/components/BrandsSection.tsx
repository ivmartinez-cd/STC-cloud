import type { DashboardData } from '../../../shared/types/monitor';
import SectionHead from './SectionHead';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt } from '../../../shared/lib/formatters';

const ROW = 'grid grid-cols-[76px_minmax(0,1fr)_34px] items-center gap-3 border-b border-line-200 py-[9px]';

function Row({ brand, count, max, leader }: { brand: string; count: number; max: number; leader: boolean }) {
  return (
    <div className={ROW}>
      <span className="truncate font-sans text-[13px] text-ink-700">{brand}</span>
      <MiniBar pct={(count / max) * 100} minPct={2} height={6} radius={0} color={leader ? 'var(--color-brand)' : 'var(--color-ink-700)'} />
      <span className="text-right font-mono text-[13px] tabular-nums text-ink-900">{fmt(count)}</span>
    </div>
  );
}

/** "Marcas del parque" del rediseño minimalista (handoff "Panel de control",
 * 16/09/2026): vuelve a filas con barra horizontal — las columnas verticales
 * del rediseño anterior truncaban el nombre de marca y no escalaban más allá
 * de 4-5. La marca líder va en naranja de marca; el resto, en tinta. */
export default function BrandsSection({
  brands, loading, error, onRetry,
}: {
  brands: DashboardData['brands'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = [...(brands ?? [])].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((b) => b.count));

  return (
    <section>
      <SectionHead title="Marcas del parque" />
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={ROW}><SkeletonBlock heightPx={11} widthPct={70} /><MiniBar pct={0} height={6} radius={0} /><SkeletonBlock heightPx={11} widthPct={80} className="ml-auto" /></div>
        ))
      ) : rows.length === 0 ? (
        <CardEmpty />
      ) : (
        rows.map((b, i) => <Row key={b.brand} brand={b.brand} count={b.count} max={max} leader={i === 0} />)
      )}
    </section>
  );
}
