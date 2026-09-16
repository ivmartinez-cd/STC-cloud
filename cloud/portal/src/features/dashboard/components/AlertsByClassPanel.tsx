import { Link } from 'react-router-dom';
import type { DashboardData, DashboardTrend, TrendRange } from '../../../shared/types/monitor';
import Panel, { PanelFoot, PanelMeta } from './Panel';
import CardError from '../../../shared/components/CardError';
import CardEmpty from './CardEmpty';
import SkeletonBlock from './Skeleton';
import MiniBar from './MiniBar';
import Delta from './Delta';
import { fmt, fmtPct } from '../../../shared/lib/formatters';
import { TIER_COLOR, tierOf } from '../lib/alert-tiers';
import { classDeltas, deltaNote } from '../lib/trend';

type AlertRow = NonNullable<DashboardData['alertsByClass']>[number];

const GRID = 'grid grid-cols-[minmax(110px,1fr)_minmax(80px,190px)_40px_44px_40px] items-center gap-3 py-[7px]';

// "y" → "e" delante de palabra que empieza con sonido "i" (Información,
// Interrupción...) — las clases son datos dinámicos, no se puede fijar "y" a mano.
function conjunctionBefore(word: string): string {
  return /^(hi(?!e)|i)/i.test(word) ? 'e' : 'y';
}

/** Fila de clase: nombre · barra proporcional al MÁXIMO de la serie (no al
 * total, README) · cifra mono · porcentaje sobre el total · variación. */
function Row({ row, max, total, delta, lead }: {
  row: AlertRow; max: number; total: number; delta: number | null; lead: boolean;
}) {
  return (
    <Link
      to={`/alerts?class=${row.alert_class}&resolved=false`}
      className={`${GRID} border-b border-line-200 transition-colors duration-[120ms] ease-in-out hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`}
    >
      <span className={`truncate font-sans text-[13px] leading-[1.2] ${lead ? 'font-medium text-ink-900' : 'text-ink-700'}`}>{row.label}</span>
      <MiniBar pct={max > 0 ? (row.count / max) * 100 : 0} minPct={2} color={TIER_COLOR[tierOf(row.alert_class)]} height={7} radius={0} />
      <span className="text-right font-mono text-[13px] tabular-nums text-ink-900">{fmt(row.count)}</span>
      <span className="text-right font-mono text-[11px] tabular-nums text-ink-300">{fmtPct(row.count, total)}</span>
      <Delta value={delta} className="text-right" />
    </Link>
  );
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <div className={`${GRID} border-b border-line-200`}>
      <SkeletonBlock heightPx={10} widthPct={70 - (i % 3) * 8} />
      <MiniBar pct={0} height={7} radius={0} />
      <SkeletonBlock heightPx={10} widthPct={80} className="ml-auto" />
      <SkeletonBlock heightPx={10} widthPct={70} className="ml-auto" />
      <span />
    </div>
  );
}

/** Pie: cuánto concentran las dos primeras clases + qué es la última columna. */
function Foot({ rows, total, hasDeltas, range }: {
  rows: AlertRow[]; total: number; hasDeltas: boolean; range: TrendRange;
}) {
  const share = fmtPct((rows[0]?.count ?? 0) + (rows[1]?.count ?? 0), total);
  return (
    <PanelFoot>
      {rows[1]
        ? `${rows[0].label} ${conjunctionBefore(rows[1].label)} ${rows[1].label.toLowerCase()} concentran el `
        : `${rows[0].label} concentra el `}
      <span className="text-brand-accent">{share}</span> del total
      {hasDeltas && <> · última columna: variación {deltaNote(range)}</>}
    </PanelFoot>
  );
}

/**
 * "Alertas por clase" (handoff "Panel de control", 16/09/2026, segunda tanda):
 * el desglose completo en un panel propio, con la columna de VARIACIÓN que el
 * rediseño anterior no tenía — sin ella la tabla decía qué hay, pero no qué
 * está empeorando.
 *
 * La variación sale de la misma serie que dibuja el titular
 * (`GET /dashboard/trend`, primer punto vs. último de la ventana), así que
 * cambia con el chip de rango y nunca discrepa de la sparkline de arriba. Si
 * todavía no hay dos tomas en la ventana, la columna simplemente no se dibuja.
 *
 * "Severidad" se mudó a su propio panel en la columna lateral: acá ya no
 * competía por el ancho de la barra.
 */
export default function AlertsByClassPanel({ alertsByClass, trend, range, loading, error, onRetry }: {
  alertsByClass: DashboardData['alertsByClass'] | undefined;
  trend: DashboardTrend | null;
  range: TrendRange;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = [...(alertsByClass ?? [])].sort((a, b) => b.count - a.count);
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const max = rows[0]?.count ?? 0;
  const deltas = classDeltas(trend);

  return (
    <Panel
      title="Alertas por clase"
      right={!loading && !error && (
        <PanelMeta><span className="font-mono text-[13px] tabular-nums text-ink-900">{fmt(total)}</span> activas</PanelMeta>
      )}
    >
      {error ? (
        <CardError onRetry={onRetry} />
      ) : loading ? (
        Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} i={i} />)
      ) : rows.length === 0 ? (
        <CardEmpty text="Sin alertas activas" />
      ) : (
        <>
          {rows.map((r, i) => (
            <Row key={r.alert_class} row={r} max={max} total={total} lead={i < 2} delta={deltas?.[r.alert_class] ?? null} />
          ))}
          <Foot rows={rows} total={total} hasDeltas={!!deltas} range={range} />
        </>
      )}
    </Panel>
  );
}
