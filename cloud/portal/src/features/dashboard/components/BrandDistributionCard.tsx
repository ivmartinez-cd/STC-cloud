import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt, fmtPct } from '../../../shared/lib/formatters';

// Ciclo de 5 tonos institucionales (naranja + grises — README) para colorear
// marcas en orden de aparición, igual que el handoff.
const PALETTE = [
  'var(--color-brand)',
  'var(--color-brand-gray)',
  'var(--color-brand-light)',
  'var(--color-ink-500)',
  'var(--color-brand-severe)',
];

/** "Distribución de marcas" del handoff hifi: barra apilada + filas marca →
 * equipos → %. */
export default function BrandDistributionCard({
  brands, loading, error, onRetry,
}: {
  brands: DashboardData['brands'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = brands ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <SdsPanel title="Distribución de marcas" headerClassName="px-[18px] py-[14px]">
      <div className="px-[18px] pb-[15px] pt-4">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <>
            <MiniBar pct={0} height={7} radius={4} className="mb-3.5" />
            {Array.from({ length: 4 }, (_, i) => <SkeletonBlock key={i} heightPx={12} className="mb-2" />)}
          </>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <>
            <div className="mb-3.5 flex h-[7px] overflow-hidden rounded-[4px]">
              {rows.map((b, i) => (
                <div key={b.brand} style={{ width: `${Math.max(total > 0 ? (b.count / total) * 100 : 0, 0.5)}%`, background: PALETTE[i % PALETTE.length] }} />
              ))}
            </div>
            {rows.map((b, i) => (
              <div key={b.brand} className="grid grid-cols-[8px_1fr_54px_46px] items-center gap-[9px] border-b border-line-200 py-1.5">
                <span className="block h-[7px] w-[7px] rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="truncate font-sans text-[12px] leading-[1.2] text-ink-700">{b.brand}</span>
                <span className="text-right font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt(b.count)}</span>
                <span className="text-right font-sans text-[11.5px] text-ink-300">{fmtPct(b.count, total)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </SdsPanel>
  );
}
