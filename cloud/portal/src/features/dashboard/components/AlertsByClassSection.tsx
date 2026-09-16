import { Link } from 'react-router-dom';
import type { DashboardData } from '../../../shared/types/monitor';
import SectionHead from './SectionHead';
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
// y es también la que alimenta la barra apilada "Severidad" — por eso
// `availability` y `system_change`, que antes tenían un tono institucional
// propio, se pliegan a "atención" e "informativa" respectivamente (la barra
// necesita exactamente 3 baldes).
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

interface TierTotal { tier: Tier; value: number }

function tierOf(alertClass: string): Tier {
  return CLASS_TIER[alertClass] ?? 'info';
}

// "y" → "e" delante de palabra que empieza con sonido "i" (Información,
// Interrupción...) — las clases son datos dinámicos, no se puede fijar "y" a mano.
function conjunctionBefore(word: string): string {
  return /^(hi(?!e)|i)/i.test(word) ? 'e' : 'y';
}

/** Fila de clase: nombre · barra proporcional al MÁXIMO de la serie (no al
 * total, README) · cifra mono · porcentaje sobre el total. */
function Row({ row, max, total }: { row: AlertRow; max: number; total: number }) {
  return (
    <Link
      to={`/alerts?class=${row.alert_class}&resolved=false`}
      className="grid grid-cols-[minmax(110px,1.1fr)_minmax(0,2fr)_42px_44px] items-center gap-3.5 border-b border-line-200 py-2 transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      <span className="truncate font-sans text-[13px] leading-[1.2] text-ink-700">{row.label}</span>
      <MiniBar pct={max > 0 ? (row.count / max) * 100 : 0} minPct={2} color={TIER_COLOR[tierOf(row.alert_class)]} height={6} radius={0} />
      <span className="text-right font-mono text-[13px] tabular-nums text-ink-900">{fmt(row.count)}</span>
      <span className="text-right font-mono text-[11px] tabular-nums text-ink-300">{fmtPct(row.count, total)}</span>
    </Link>
  );
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <div className="grid grid-cols-[minmax(110px,1.1fr)_minmax(0,2fr)_42px_44px] items-center gap-3.5 border-b border-line-200 py-2">
      <SkeletonBlock heightPx={10} widthPct={70 - (i % 3) * 8} />
      <MiniBar pct={0} height={6} radius={0} />
      <SkeletonBlock heightPx={10} widthPct={80} className="ml-auto" />
      <SkeletonBlock heightPx={10} widthPct={70} className="ml-auto" />
    </div>
  );
}

/** Barra apilada única (reemplaza al anillo del rediseño anterior): un solo
 * track de 8px con los tres tonos en proporción al total. */
function SeverityBar({ tiers, total }: { tiers: TierTotal[]; total: number }) {
  return (
    <div className="flex h-2 bg-surface-track">
      {tiers.map((t) => (
        t.value > 0 && <span key={t.tier} style={{ width: `${(t.value / total) * 100}%`, background: TIER_COLOR[t.tier] }} />
      ))}
    </div>
  );
}

function SeverityLegendRow({ tier, value, total }: { tier: Tier; value: number; total: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="block h-[7px] w-[7px] shrink-0" style={{ background: TIER_COLOR[tier] }} />
      <span className="flex-1 font-sans text-[13px] text-ink-700">{TIER_LABEL[tier]}</span>
      <span className="font-mono text-[13px] tabular-nums text-ink-900">{fmt(value)}</span>
      <span className="w-11 text-right font-mono text-[11px] tabular-nums text-ink-300">{fmtPct(value, total)}</span>
    </div>
  );
}

function SeverityNote({ rows, total, criticalTotal }: { rows: AlertRow[]; total: number; criticalTotal: number }) {
  const share = fmtPct((rows[0]?.count ?? 0) + (rows[1]?.count ?? 0), total);
  return (
    <p className="m-0 font-sans text-[12px] leading-[1.6] text-ink-400">
      {rows[1] ? `${rows[0].label} ${conjunctionBefore(rows[1].label)} ${rows[1].label.toLowerCase()} concentran el ` : `${rows[0].label} concentra el `}
      <span className="text-brand-accent">{share}</span> del total; las clases críticas suman {fmt(criticalTotal)} alertas.
    </p>
  );
}

function SeverityColumn({ rows, tiers, total }: { rows: AlertRow[]; tiers: TierTotal[]; total: number }) {
  const criticalTotal = tiers.find((t) => t.tier === 'critical')?.value ?? 0;
  return (
    <div className="flex min-w-0 flex-col gap-[22px] short:gap-4">
      <SectionHead title="Severidad" />
      <SeverityBar tiers={tiers} total={total} />
      <div className="flex flex-col gap-2.5">
        {tiers.map((t) => <SeverityLegendRow key={t.tier} tier={t.tier} value={t.value} total={total} />)}
      </div>
      {rows[0] && <SeverityNote rows={rows} total={total} criticalTotal={criticalTotal} />}
    </div>
  );
}

/** "Alertas por clase" + "Severidad" del rediseño minimalista (handoff
 * "Panel de control", 16/09/2026): lista ordenada de mayor a menor a la
 * izquierda (3fr) y el reparto por severidad a la derecha (2fr), cada una
 * con su propia cabecera de sección. Sin caja ni anillo: la barra apilada
 * de 8px dice lo mismo que el donut anterior ocupando una línea. */
export default function AlertsByClassSection({
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
  const tiers: TierTotal[] = (['critical', 'warning', 'info'] as Tier[]).map((tier) => ({
    tier,
    value: rows.filter((r) => tierOf(r.alert_class) === tier).reduce((acc, r) => acc + r.count, 0),
  }));

  if (error) return <section><SectionHead title="Alertas por clase" /><CardError onRetry={onRetry} /></section>;

  return (
    <section className="grid grid-cols-1 items-start gap-10 short:gap-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <SectionHead
          title="Alertas por clase"
          right={!loading && <span className="font-sans text-[12px] text-ink-400"><span className="font-mono tabular-nums text-ink-900">{fmt(total)}</span> total</span>}
        />
        {loading
          ? Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} i={i} />)
          : rows.length === 0
            ? <CardEmpty text="Sin alertas activas" />
            : rows.map((r) => <Row key={r.alert_class} row={r} max={max} total={total} />)}
      </div>
      {!loading && rows.length > 0 && <SeverityColumn rows={rows} tiers={tiers} total={total} />}
    </section>
  );
}
