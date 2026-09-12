import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';
import { fmt } from '../../../shared/lib/formatters';

const R = 36;
const CIRC = 2 * Math.PI * R;

// Semáforo apagado (`--color-severity-*`, 11/09/2026): "en línea" es verde
// (nada que atender) y "sin conexión" es rojo — misma escala que las colas
// del panel.
function Donut({ online, offline }: { online: number; offline: number }) {
  const total = online + offline;
  const offlineLen = total > 0 ? (offline / total) * CIRC : 0;
  const onlineLen = total > 0 ? (online / total) * CIRC : 0;
  // Mismo origen para ambos arcos: el de ENCIMA debe ser siempre el más
  // corto o "come" entero al de abajo, dejando un hueco color track en vez
  // del tono correcto — por eso el orden se decide según cuál es mayor.
  const [base, top] = offline >= online
    ? [{ len: offlineLen, color: 'var(--color-severity-critical)' }, { len: onlineLen, color: 'var(--color-severity-ok)' }]
    : [{ len: onlineLen, color: 'var(--color-severity-ok)' }, { len: offlineLen, color: 'var(--color-severity-critical)' }];
  return (
    <svg width={92} height={92} viewBox="0 0 92 92" className="shrink-0">
      <circle cx={46} cy={46} r={R} fill="none" stroke="var(--color-surface-track)" strokeWidth={14} />
      <circle cx={46} cy={46} r={R} fill="none" stroke={base.color} strokeWidth={14}
        strokeDasharray={`${base.len} ${CIRC}`} transform="rotate(-90 46 46)" />
      <circle cx={46} cy={46} r={R} fill="none" stroke={top.color} strokeWidth={14}
        strokeDasharray={`${top.len} ${CIRC}`} transform="rotate(-90 46 46)" />
    </svg>
  );
}

function LegendRow({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line-200 py-1.5">
      <span className="flex min-w-0 items-center gap-2 font-sans text-[12px] text-ink-700">
        <span className="block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dot }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{fmt(value)}</span>
    </div>
  );
}

/** "Presencia de monitores" del handoff hifi: donut 92×92 + leyenda En
 * línea/Sin conexión/TOTAL. */
export default function MonitorPresenceCard({
  agents, loading, error, onRetry,
}: {
  agents: DashboardData['stats']['agents'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const total = agents?.total ?? 0;
  const online = agents?.online ?? 0;
  const offline = Math.max(0, total - online);

  return (
    <SdsPanel title="Presencia de monitores" headerClassName="px-[18px] py-[14px]">
      <div className="flex items-center gap-4 px-[18px] pb-4 pt-[18px]">
        {error ? (
          <CardError onRetry={onRetry} className="w-full py-2" />
        ) : loading ? (
          <>
            <SkeletonBlock heightPx={92} className="shrink-0 rounded-full" style={{ width: 92 }} />
            <div className="flex-1">
              <SkeletonBlock heightPx={12} className="mb-2" />
              <SkeletonBlock heightPx={12} className="mb-2" />
              <SkeletonBlock heightPx={12} widthPct={50} />
            </div>
          </>
        ) : (
          <>
            <Donut online={online} offline={offline} />
            <div className="min-w-0 flex-1">
              <LegendRow dot="var(--color-severity-ok)" label="En línea" value={online} />
              <LegendRow dot="var(--color-severity-critical)" label="Sin conexión" value={offline} />
              <div className="flex items-center justify-between gap-2 pt-[7px]">
                <span className="whitespace-nowrap font-sans text-[10.5px] tracking-[.04em] text-ink-300">TOTAL</span>
                <span className="shrink-0 font-montserrat text-[13px] font-bold text-ink-900">{fmt(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </SdsPanel>
  );
}
