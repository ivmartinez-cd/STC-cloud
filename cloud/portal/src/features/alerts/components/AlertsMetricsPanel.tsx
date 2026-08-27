import { fmt } from '../../../shared/lib/formatters';
import type { AlertSummary } from '../../../shared/types/alerts';

interface Cell { label: string; value: string; note: string; accent?: boolean }

function buildCells(summary: AlertSummary | null): Cell[] {
  return [
    { label: 'SIN RESOLVER', value: fmt(summary?.total ?? 0), note: `${fmt(summary?.total ?? 0)} sin reconocer`, accent: true },
    { label: 'CRÍTICAS', value: fmt(summary?.bySeverity.critical ?? 0), note: summary ? `${Math.round((summary.bySeverity.critical / Math.max(summary.total, 1)) * 100)}% del total` : '', accent: true },
    { label: 'ADVERTENCIAS', value: fmt(summary?.bySeverity.warning ?? 0), note: summary ? `${Math.round((summary.bySeverity.warning / Math.max(summary.total, 1)) * 100)}% del total` : '' },
    { label: 'CLIENTES AFECTADOS', value: fmt(summary?.clients_affected ?? 0), note: '' },
  ];
}

function MetricCell({ cell, loading }: { cell: Cell; loading: boolean }) {
  return (
    <div className="bg-white px-[18px] pb-4 pt-[15px] short:pb-2.5 short:pt-2.5">
      <div className="min-h-[22px] font-montserrat text-[8px] font-bold uppercase leading-[1.4] tracking-[.13em] text-ink-300">{cell.label}</div>
      {loading ? (
        <span className="mt-1.5 block h-[21px] w-3/5 animate-pulse rounded bg-surface-track" />
      ) : (
        <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>{cell.value}</div>
      )}
      <div className="font-sans text-[11px] leading-[1.4] text-ink-300">{loading ? ' ' : cell.note}</div>
    </div>
  );
}

interface Props {
  summary: AlertSummary | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Tira de 4 métricas de Alertas (handoff hifi #3, 26/08/2026) — a diferencia de
 * `shared/components/MetricsStrip.tsx` (breakpoints de VIEWPORT para ocupar todo
 * el ancho), esta tarjeta vive en la mitad izquierda de un grid de 2 columnas
 * junto a `AlertsByCodePanel` (`Alertas.dc.html:37-38`): el mockup usa
 * `auto-fit,minmax(140px,1fr)` — el 2×2 sale solo del ancho del CONTENEDOR, no
 * del viewport. Por eso no reutiliza `MetricsStrip` (forzaría 4 columnas fijas
 * incluso a mitad de pantalla). En `lg+` se fuerza el 2×2: el grid de la página
 * iguala la altura de las dos celdas y la tira de 4 en fila (≈100 px) quedaba
 * estirada al alto del panel de códigos con el número flotando arriba
 * (revisión de Ivan, 27/08/2026). */
export default function AlertsMetricsPanel({ summary, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 lg:grid-cols-2">
      {buildCells(summary).map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
