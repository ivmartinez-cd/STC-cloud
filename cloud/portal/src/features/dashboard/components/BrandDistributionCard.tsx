import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

// Ciclo de 5 tonos institucionales (naranja + grises — README) para colorear
// marcas en orden de aparición, igual que el handoff.
const PALETTE = [
  'var(--color-brand)',
  'var(--color-brand-gray)',
  'var(--color-brand-light)',
  'var(--color-ink-500)',
  'var(--color-brand-severe)',
];

const BAR_TRACK_HEIGHT = 74;

/** "Marcas del parque" del rediseño "V1 Compacta" (handoff 14/09/2026):
 * columnas verticales (una por marca) en vez de la barra apilada + filas
 * que tenía antes — más legible a simple vista para el mismo dato. */
export default function BrandDistributionCard({
  brands, loading, error, onRetry,
}: {
  brands: DashboardData['brands'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = brands ?? [];
  const max = Math.max(1, ...rows.map((b) => b.count));

  return (
    <SdsPanel title="Marcas del parque" headerClassName="px-[18px] py-[14px]">
      <div className="px-[18px] pb-4 pt-4">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <div className="flex items-end gap-2.5" style={{ height: BAR_TRACK_HEIGHT + 22 }}>
            {Array.from({ length: 4 }, (_, i) => <SkeletonBlock key={i} heightPx={BAR_TRACK_HEIGHT - (i % 3) * 16} className="flex-1 self-end" />)}
          </div>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <>
            <div className="flex items-end gap-2.5 border-b border-line-100 pb-2" style={{ height: BAR_TRACK_HEIGHT + 22 }}>
              {rows.map((b, i) => (
                <div key={b.brand} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="font-montserrat text-[11px] font-semibold tabular-nums text-ink-700">{fmt(b.count)}</span>
                  <div
                    className="w-full rounded-t-[2px]"
                    style={{ height: Math.max(3, (b.count / max) * BAR_TRACK_HEIGHT), background: PALETTE[i % PALETTE.length] }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2.5">
              {rows.map((b) => (
                <div key={b.brand} className="flex-1 truncate text-center font-sans text-[10.5px] leading-[1.3] text-ink-300">{b.brand}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </SdsPanel>
  );
}
