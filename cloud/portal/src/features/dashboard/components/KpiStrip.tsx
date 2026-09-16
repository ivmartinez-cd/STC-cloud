import type { DashboardData, DashboardTrend, TrendRange } from '../../../shared/types/monitor';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';
import { fmt, fmtPct, pctOf } from '../../../shared/lib/formatters';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';
import Sparkline from './Sparkline';
import KpiDelta, { type WorseWhen } from './KpiDelta';
import { deltaNote, seriesOf, type Series, type TrendMetric } from '../lib/trend';

type Stats = DashboardData['stats'];
type AlertsByClass = DashboardData['alertsByClass'];

interface Cell {
  label: string;
  value: string;
  note: string;
  tone: string;
  /** Qué dirección de la variación es la mala — decide el color del delta. */
  worseWhen: WorseWhen;
  /** De dónde sale la serie de este KPI en `GET /dashboard/trend`. */
  metric: TrendMetric;
  loading?: boolean;
}

interface KpiStripProps {
  stats: Stats | undefined;
  alertsByClass: AlertsByClass | undefined;
  supplies: SuppliesSummaryResponse | null | undefined;
  suppliesLoading?: boolean;
  trend: DashboardTrend | null;
  range: TrendRange;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

/** Nulo mientras una métrica no tenga historia — ver `lib/trend.ts`. */
function Trend({ series, cell, range }: { series: Series | null; cell: Cell; range: TrendRange }) {
  if (!series) return null;
  return (
    <>
      <KpiDelta series={series} worseWhen={cell.worseWhen} note={deltaNote(range)} />
      <Sparkline values={series.values} color={cell.tone} className="mt-0.5" />
    </>
  );
}

function Kpi({ cell, trend, range }: { cell: Cell; trend: DashboardTrend | null; range: TrendRange }) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px] overflow-hidden px-[18px] pb-3.5 pt-4 shadow-[1px_0_0_var(--color-line-150)] short:pb-2.5 short:pt-3">
      <div className="flex items-center gap-2">
        <span className="block h-1.5 w-1.5 shrink-0" style={{ background: cell.tone }} />
        <span className="font-montserrat text-[10px] font-semibold uppercase leading-none tracking-[.12em] text-ink-300">{cell.label}</span>
      </div>
      {cell.loading ? (
        <SkeletonBlock heightPx={26} widthPct={45} className="mt-1" />
      ) : (
        <>
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[26px] leading-none tabular-nums" style={{ color: cell.tone }}>{cell.value}</span>
            <span className="font-sans text-[11px] text-ink-400">{cell.note}</span>
          </span>
          <Trend series={seriesOf(trend, cell.metric)} cell={cell} range={range} />
        </>
      )}
    </div>
  );
}

/** Las cuatro celdas, en el orden del handoff. Cada una trae su propio color
 * de cifra: es el único lugar del bloque donde hay color, y sigue la escala
 * de severidad del portal (`--color-severity-*`, semáforo apagado). */
function kpiCells(stats: Stats | undefined, alertsByClass: AlertsByClass | undefined, supplies: SuppliesSummaryResponse | null | undefined, loading?: boolean, suppliesLoading?: boolean): Cell[] {
  const rows = alertsByClass ?? [];
  const alerts = rows.reduce((acc, r) => acc + r.count, 0);
  const top1 = rows[0];
  const devices = stats?.devices ?? 0;
  const managed = Math.max(0, devices - (stats?.devicesUnmanaged ?? 0));
  const agents = stats?.agents.total ?? 0;
  const online = stats?.agents.online ?? 0;
  const offline = Math.max(0, agents - online);
  const supplyAlerts = supplies ? supplies.criticalCount + supplies.lowCount : 0;
  return [
    {
      label: 'Alertas activas', value: fmt(alerts), tone: 'var(--color-severity-critical)', loading,
      note: top1 ? `${fmtPct(top1.count, alerts)} ${top1.label.toLowerCase()}` : 'sin alertas activas',
      worseWhen: 'up', metric: (p) => p.alerts,
    },
    {
      label: 'Consumibles en alerta', value: fmt(supplyAlerts), tone: 'var(--color-brand-severe)',
      loading: suppliesLoading && !supplies,
      note: supplies ? `${fmt(supplies.criticalCount)} críticos` : 'sin datos',
      worseWhen: 'up',
      metric: (p) => (p.suppliesCritical == null || p.suppliesLow == null ? null : p.suppliesCritical + p.suppliesLow),
    },
    {
      label: 'Parque gestionado', value: fmt(managed), tone: 'var(--color-ink-900)', loading,
      note: `de ${fmt(devices)} · ${Math.round(pctOf(managed, devices))}%`,
      worseWhen: 'down', metric: (p) => p.devicesManaged,
    },
    {
      label: 'Monitores en línea', value: `${fmt(online)}/${fmt(agents)}`, loading,
      tone: offline > 0 ? 'var(--color-severity-critical)' : 'var(--color-severity-ok)',
      note: offline > 0 ? `${fmt(offline)} sin conexión` : agents > 0 ? 'sin caídas' : 'sin monitores',
      worseWhen: 'down', metric: (p) => p.agentsOnline,
    },
  ];
}

/**
 * Franja KPI del panel (handoff "Panel de control", 16/09/2026): un solo panel
 * blanco con cuatro celdas separadas por un divisor de 1px que es un
 * `box-shadow`, no un borde — así la última celda no dibuja una línea suelta
 * contra el borde del panel.
 *
 * La franja NUNCA envuelve: es un requisito del handoff, no un detalle. Las
 * celdas encogen (`flex: 1 1 0` + `min-w-0` + `overflow-hidden`) hasta el ancho
 * que haga falta; una quinta fila con una sola celda rompería la lectura de
 * "estas cuatro cifras son el titular".
 *
 * Cada celda dibuja su tendencia sólo si la tiene. De las cuatro métricas, hoy
 * únicamente las alertas traen historia backfilleada; las otras tres se van
 * llenando con las tomas horarias desde que se despliega el job (ver
 * `dashboardSnapshotJob.ts`). Mientras tanto la celda muestra cifra y nota, sin
 * curva — no se dibuja una línea que no se midió.
 */
export default function KpiStrip({ stats, alertsByClass, supplies, suppliesLoading, trend, range, loading, error, onRetry }: KpiStripProps) {
  // El error es del bloque entero, no de cada celda: las cuatro cifras salen
  // de la misma respuesta (`/dashboard` + `/supplies/summary`), así que
  // repetir "No se pudo cargar" cuatro veces no agregaría información.
  if (error) return <section className="border border-line-100 bg-white"><CardError onRetry={onRetry} /></section>;

  const cells = kpiCells(stats, alertsByClass, supplies, loading, suppliesLoading);
  return (
    <section className="flex overflow-hidden border border-line-100 bg-white">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 flex-1 basis-0">
          <Kpi cell={cell} trend={trend} range={range} />
        </div>
      ))}
    </section>
  );
}
