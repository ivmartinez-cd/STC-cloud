import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SdsPanel from './SdsPanel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import { fmt, fmtPct } from '../../../shared/lib/formatters';

type AlertRow = NonNullable<DashboardData['alertsByClass']>[number];
type Tier = 'critical' | 'warning' | 'info';

// No existe una severidad real por `alert_class` en el backend (sólo
// `alerts.severity`, por instancia — ver `ALERT_CLASS_LABELS` en
// `cloud/src/modules/alerts/domain/entities/alert.ts`): esto es la misma
// agrupación visual de 3 tonos que ya existía acá (severo/atención/neutro),
// sólo que ahora también alimenta el anillo "Reparto por severidad" del
// rediseño "V1 Compacta" — por eso `availability` y `system_change`, que
// antes tenían un tono institucional propio, se pliegan a "atención" e
// "informativa" respectivamente (el anillo necesita exactamente 3 baldes).
const CLASS_TIER: Record<string, Tier> = {
  consumable_out: 'critical',
  system_failure: 'critical',
  jam: 'critical',
  subunit_out: 'critical',
  media_out: 'critical',
  availability: 'warning',
  consumable_low: 'warning',
  system_warning: 'warning',
  user_action: 'warning',
  subunit_low: 'warning',
  media_low: 'warning',
  information: 'info',
  system_change: 'info',
  other: 'info',
};

const TIER_COLOR: Record<Tier, string> = {
  critical: 'var(--color-severity-critical)',
  warning: 'var(--color-brand-light)',
  info: 'var(--color-ink-500)',
};

const TIER_LABEL: Record<Tier, string> = {
  critical: 'Críticas',
  warning: 'Advertencias',
  info: 'Informativas',
};

function tierOf(alertClass: string): Tier {
  return CLASS_TIER[alertClass] ?? 'info';
}

// "y" → "e" delante de palabra que empieza con sonido "i" (Información,
// Interrupción...) — las clases son datos dinámicos, no se puede fijar "y" a mano.
function conjunctionBefore(word: string): string {
  return /^(hi(?!e)|i)/i.test(word) ? 'e' : 'y';
}

function Row({ row, max, total }: { row: AlertRow; max: number; total: number }) {
  const pct = Math.max(1.2, max > 0 ? (row.count / max) * 100 : 0);
  const color = TIER_COLOR[tierOf(row.alert_class)];
  return (
    <Link
      to={`/alerts?class=${row.alert_class}&resolved=false`}
      className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)_78px] items-center gap-3 border-b border-line-200 py-[7px] transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <span className="truncate font-sans text-[12.5px] leading-[1.2] text-ink-700">{row.label}</span>
      <span className="block h-3.5 rounded-[2px] bg-surface-track">
        <span className="block h-full rounded-[2px]" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="flex items-baseline justify-end gap-1.5">
        <span className="font-montserrat text-[12.5px] font-semibold tabular-nums text-ink-900">{fmt(row.count)}</span>
        <span className="font-sans text-[10px] text-ink-300">{fmtPct(row.count, total)}</span>
      </span>
    </Link>
  );
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)_78px] items-center gap-3 border-b border-line-200 py-[7px]">
      <SkeletonBlock heightPx={10} widthPct={70 - (i % 3) * 8} />
      <MiniBar pct={0} height={14} radius={2} />
      <SkeletonBlock heightPx={10} widthPct={80} className="ml-auto" />
    </div>
  );
}

function SeverityRing({ tiers }: { tiers: Array<{ tier: Tier; value: number }> }) {
  const total = tiers.reduce((acc, t) => acc + t.value, 0);
  let acc = 0;
  const arcs = tiers.map((t) => {
    const dash = total > 0 ? (t.value / total) * 100 : 0;
    const offset = -acc;
    acc += dash;
    return { ...t, dash, offset };
  });

  return (
    <svg width={104} height={104} viewBox="0 0 112 112" className="shrink-0" aria-label="Reparto de alertas por severidad">
      <circle cx={56} cy={56} r={44} fill="none" stroke="var(--color-surface-track)" strokeWidth={14} />
      {arcs.map((a) => (
        a.dash > 0 && (
          <circle
            key={a.tier} cx={56} cy={56} r={44} fill="none" stroke={TIER_COLOR[a.tier]} strokeWidth={14}
            pathLength={100} strokeDasharray={`${a.dash} ${100 - a.dash}`} strokeDashoffset={a.offset}
            transform="rotate(-90 56 56)" strokeLinecap={arcs.filter((x) => x.dash > 0).length > 1 ? 'butt' : 'round'}
          />
        )
      ))}
      <text x={56} y={52} textAnchor="middle" fontFamily="var(--font-heading)" fontSize={19} fontWeight={800} fill="var(--color-ink-900)">{fmt(total)}</text>
      <text x={56} y={68} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={8.5} letterSpacing={1} fill="var(--color-ink-300)">ALERTAS</text>
    </svg>
  );
}

/** "Alertas por clase" del rediseño "V1 Compacta" (handoff 14/09/2026): una
 * sola lista ordenada de mayor a menor a la izquierda + anillo "Reparto por
 * severidad" a la derecha, en la misma tarjeta — reemplaza el layout de 2
 * columnas de filas que tenía antes. */
export default function AlertsByClassCard({
  alertsByClass, loading, error, onRetry,
}: {
  alertsByClass: DashboardData['alertsByClass'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = [...(alertsByClass ?? [])].sort((a, b) => b.count - a.count);
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const max = rows[0]?.count ?? 0;

  const tierTotals = (['critical', 'warning', 'info'] as Tier[]).map((tier) => ({
    tier,
    value: rows.filter((r) => tierOf(r.alert_class) === tier).reduce((acc, r) => acc + r.count, 0),
  }));
  const criticalTotal = tierTotals.find((t) => t.tier === 'critical')?.value ?? 0;
  const top2Share = fmtPct((rows[0]?.count ?? 0) + (rows[1]?.count ?? 0), total);

  return (
    <SdsPanel
      title="Alertas por clase"
      headerRight={
        !loading && !error ? (
          <span className="flex items-center gap-3.5">
            {(['critical', 'warning', 'info'] as Tier[]).map((tier) => (
              <span key={tier} className="flex items-center gap-1.5 font-sans text-[11px] text-ink-400">
                <span className="block h-2 w-2 rounded-[2px]" style={{ background: TIER_COLOR[tier] }} />
                {TIER_LABEL[tier]}
              </span>
            ))}
            <span className="font-montserrat text-[13px] font-bold tabular-nums text-ink-900">{fmt(total)} total</span>
          </span>
        ) : undefined
      }
    >
      <div className="px-5 pb-4 pt-2">
        {error ? (
          <CardError onRetry={onRetry} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-x-7 lg:grid-cols-[1.6fr_1fr]">
            <div>{Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} i={i} />)}</div>
          </div>
        ) : rows.length === 0 ? (
          <CardEmpty />
        ) : (
          <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[1.6fr_1fr]">
            <div>{rows.map((r) => <Row key={r.alert_class} row={r} max={max} total={total} />)}</div>

            <div className="flex flex-col gap-3.5 border-line-150 pt-1 lg:border-l lg:pl-6">
              <div className="flex items-center gap-4">
                <SeverityRing tiers={tierTotals} />
                <div className="flex flex-col gap-2 font-sans text-[12.5px]">
                  {tierTotals.map((t) => (
                    <div key={t.tier} className="flex items-center gap-2">
                      <span className="block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TIER_COLOR[t.tier] }} />
                      <span className="min-w-[74px] text-ink-700">{TIER_LABEL[t.tier]}</span>
                      <span className="font-montserrat text-[12px] font-semibold tabular-nums text-ink-900">{fmt(t.value)}</span>
                      <span className="font-sans text-[10px] text-ink-300">{fmtPct(t.value, total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {rows[0] && (
                <p className="border-t border-line-150 pt-3 font-sans text-[11.5px] leading-[1.5] text-ink-400">
                  {rows[1] ? `${rows[0].label} ${conjunctionBefore(rows[1].label)} ${rows[1].label.toLowerCase()} concentran el ` : `${rows[0].label} concentra el `}
                  <b className="font-semibold text-ink-900">{top2Share}</b> del total; las clases críticas suman{' '}
                  <b className="font-semibold text-severity-critical">{fmt(criticalTotal)}</b> alertas.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </SdsPanel>
  );
}
