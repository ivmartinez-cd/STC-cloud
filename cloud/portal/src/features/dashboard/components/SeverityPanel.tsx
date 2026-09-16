import type { DashboardData, DashboardTrend, TrendRange } from '../../../shared/types/monitor';
import { TREND_RANGE_LABEL } from '../../../shared/types/monitor';
import Panel, { PanelFoot, PanelMeta } from './Panel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import Delta from './Delta';
import { fmt, fmtPct } from '../../../shared/lib/formatters';
import { TIERS, TIER_COLOR, TIER_LABEL, tierTotals, type Tier } from '../lib/alert-tiers';
import { classDeltas } from '../lib/trend';

type AlertRow = NonNullable<DashboardData['alertsByClass']>[number];

/** Barra apilada única: los tres tonos en proporción al total, en una línea. */
function StackedBar({ totals, total }: { totals: Record<Tier, number>; total: number }) {
  return (
    <div className="my-4 flex h-2.5 bg-surface-track">
      {TIERS.map((t) => (
        totals[t] > 0 && <span key={t} style={{ width: `${(totals[t] / total) * 100}%`, background: TIER_COLOR[t] }} />
      ))}
    </div>
  );
}

function LegendRow({ tier, value, total, delta }: { tier: Tier; value: number; total: number; delta: number | null }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px]">
      <span className="block h-[7px] w-[7px] shrink-0" style={{ background: TIER_COLOR[tier] }} />
      <span className="flex-1 font-sans text-[13px] text-ink-700">{TIER_LABEL[tier]}</span>
      <span className="font-mono text-[13px] tabular-nums text-ink-900">{fmt(value)}</span>
      <span className="w-[38px] text-right font-mono text-[11px] tabular-nums text-ink-300">{fmtPct(value, total)}</span>
      <Delta value={delta} className="w-[34px] text-right" />
    </div>
  );
}

/** Suma por balde de los deltas por clase — el desglose por severidad no
 * existe en el backend, se deriva de las clases (ver `lib/alert-tiers.ts`). */
function tierDeltas(byClassDelta: Record<string, number> | null): Record<Tier, number> | null {
  if (!byClassDelta) return null;
  return tierTotals(byClassDelta);
}

/**
 * "Severidad" (handoff "Panel de control", 16/09/2026, segunda tanda): panel
 * propio en la columna lateral. Una barra apilada de 10px con el reparto, la
 * leyenda con valor/porcentaje/variación, y el pie que dice lo único que hay
 * que hacer con esto — cuántas críticas necesitan a alguien en sitio.
 *
 * Reemplaza al anillo del rediseño de agosto: la barra dice lo mismo en una
 * línea y deja lugar a la columna de variación.
 */
export default function SeverityPanel({ alertsByClass, trend, range, loading, error, onRetry }: {
  alertsByClass: DashboardData['alertsByClass'] | undefined;
  trend: DashboardTrend | null;
  range: TrendRange;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows: AlertRow[] = alertsByClass ?? [];
  const totals = tierTotals(Object.fromEntries(rows.map((r) => [r.alert_class, r.count])));
  const total = TIERS.reduce((a, t) => a + totals[t], 0);
  const deltas = tierDeltas(classDeltas(trend));

  return (
    <Panel title="Severidad" right={<PanelMeta>{TREND_RANGE_LABEL[range]}</PanelMeta>}>
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        <div className="flex flex-col gap-3 py-4">
          <SkeletonBlock heightPx={10} />
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} heightPx={12} widthPct={80 - i * 10} />)}
        </div>
      ) : total === 0 ? (
        <CardEmpty text="Sin alertas activas" />
      ) : (
        <>
          <StackedBar totals={totals} total={total} />
          {TIERS.map((t) => <LegendRow key={t} tier={t} value={totals[t]} total={total} delta={deltas?.[t] ?? null} />)}
          <div className="mt-3 border-t border-line-150">
            <PanelFoot>
              {totals.critical > 0
                ? <><span className="text-severity-critical">{fmt(totals.critical)}</span> alertas críticas requieren intervención en sitio.</>
                : 'Ninguna alerta crítica abierta.'}
            </PanelFoot>
          </div>
        </>
      )}
    </Panel>
  );
}
