import type { DashboardData } from '../../../shared/types/monitor';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';
import { fmt, fmtPct, pctOf } from '../../../shared/lib/formatters';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';

type Stats = DashboardData['stats'];
type AlertsByClass = DashboardData['alertsByClass'];

interface Cell {
  label: string;
  value: string;
  note: string;
  tone: string;
  loading?: boolean;
}

interface KpiStripProps {
  stats: Stats | undefined;
  alertsByClass: AlertsByClass | undefined;
  supplies: SuppliesSummaryResponse | null | undefined;
  suppliesLoading?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function Kpi({ cell }: { cell: Cell }) {
  return (
    <div className="bg-white px-5 pb-5 pt-[18px] short:pb-3.5 short:pt-3.5">
      <div className="font-montserrat text-[10px] font-semibold uppercase leading-none tracking-[.14em] text-ink-300">{cell.label}</div>
      {cell.loading ? (
        <SkeletonBlock heightPx={30} widthPct={45} className="mt-2.5" />
      ) : (
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="font-mono text-[30px] leading-none tabular-nums short:text-[26px]" style={{ color: cell.tone }}>{cell.value}</span>
          <span className="font-sans text-[12px] text-ink-400">{cell.note}</span>
        </div>
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
    { label: 'Alertas activas', value: fmt(alerts), tone: 'var(--color-severity-critical)', loading, note: top1 ? `${fmtPct(top1.count, alerts)} ${top1.label.toLowerCase()}` : 'sin alertas activas' },
    { label: 'Consumibles en alerta', value: fmt(supplyAlerts), tone: 'var(--color-brand-severe)', loading: suppliesLoading && !supplies, note: supplies ? `${fmt(supplies.criticalCount)} críticos` : 'sin datos' },
    { label: 'Parque gestionado', value: fmt(managed), tone: 'var(--color-ink-900)', loading, note: `de ${fmt(devices)} · ${Math.round(pctOf(managed, devices))}%` },
    { label: 'Monitores en línea', value: `${fmt(online)}/${fmt(agents)}`, loading, tone: offline > 0 ? 'var(--color-severity-critical)' : 'var(--color-severity-ok)', note: offline > 0 ? `${fmt(offline)} sin conexión` : agents > 0 ? 'sin caídas' : 'sin monitores' },
  ];
}

/** Bloque KPI del rediseño minimalista (handoff "Panel de control",
 * 16/09/2026): cuatro celdas blancas separadas por hairlines de 1px — el
 * `gap` del grid ES la línea (fondo `line-100` debajo), no hay bordes ni
 * radio ni tarjetas anidadas. Reemplaza a `HeadlineCards`, que envolvía cada
 * cifra en su propia caja con borde superior de color, y absorbe el medidor
 * semicircular de "Parque gestionado" en una nota de texto. */
export default function KpiStrip({ stats, alertsByClass, supplies, suppliesLoading, loading, error, onRetry }: KpiStripProps) {
  // El error es del bloque entero, no de cada celda: las cuatro cifras salen
  // de la misma respuesta (`/dashboard` + `/supplies/summary`), así que
  // repetir "No se pudo cargar" cuatro veces no agregaría información.
  if (error) return <section className="border-y border-line-100 bg-white"><CardError onRetry={onRetry} /></section>;

  const cells = kpiCells(stats, alertsByClass, supplies, loading, suppliesLoading);
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-px border-y border-line-100 bg-line-100">
      {cells.map((cell) => <Kpi key={cell.label} cell={cell} />)}
    </section>
  );
}
