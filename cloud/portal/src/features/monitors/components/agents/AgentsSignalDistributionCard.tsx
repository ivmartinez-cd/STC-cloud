import { fmt, APP_LOCALE } from '../../../../shared/lib/formatters';
import SegmentedBar from '../../../../shared/components/SegmentedBar';
import type { AgentSignalBucketsResponse } from '../../types/agentsDirectory';

/** Color por bucket — screen-specific (README de `SegmentedBar.tsx`: "cada
 * pantalla arma su propia lista/leyenda alrededor"), no vive en el backend. */
const BUCKET_COLORS: Record<string, string> = {
  menos_1h: '#58595B', // brand-gray
  una_a_6h: '#F7941D', // brand
  seis_a_48h: '#C6710A', // brand-severe
  mas_48h: '#DDE1E2', // surface-track-alt
};

function BucketRow({ bucketKey, label, count, pct }: { bucketKey: string; label: string; count: number; pct: number }) {
  return (
    <div className="grid grid-cols-[9px_1fr_62px_54px] items-center gap-[10px] border-b border-line-200 py-[9px] last:border-b-0">
      <span className="block h-[9px] w-[9px] rounded-full" style={{ background: BUCKET_COLORS[bucketKey] }} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{label}</span>
      <span className="text-right font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{fmt(count)}</span>
      <span className="text-right font-sans text-[11.5px] tabular-nums text-ink-300">{pct.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}%</span>
    </div>
  );
}

/** "Distribución por antigüedad de señal" (handoff hifi "Salud de nodos", panel
 * derecho de la fila de 2 columnas) — una barra apilada (`SegmentedBar`
 * compartido) + la lista de 4 buckets debajo, screen-specific. */
export default function AgentsSignalDistributionCard({
  data, loading, error, onRetry,
}: {
  data: AgentSignalBucketsResponse | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  return (
    <div className="rounded-[5px] border border-line-100 bg-white p-[18px]">
      <div className="mb-[14px] flex items-center justify-between border-b border-line-150 pb-[10px]">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">
          DISTRIBUCIÓN POR ANTIGÜEDAD DE SEÑAL
        </span>
        <span className="font-sans text-[11.5px] text-ink-300">{fmt(data?.total ?? 0)} nodos</span>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
          <button
            type="button" onClick={onRetry}
            className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="h-2 w-full animate-pulse rounded-[4px] bg-surface-track" />
      ) : (
        <>
          <SegmentedBar segments={(data?.buckets ?? []).map((b) => ({ pct: b.pct, color: BUCKET_COLORS[b.key] }))} />
          <div className="mt-[14px]">
            {(data?.buckets ?? []).map((b) => (
              <BucketRow key={b.key} bucketKey={b.key} label={b.label} count={b.count} pct={b.pct} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
