import { fmt } from '../../../shared/lib/formatters';
import type { IncidentStats } from '../../../shared/types/incidents';
import { fmtAging } from '../lib/incidentPresentation';

interface Cell { label: string; value: string; note: string; accent?: boolean }

function buildCells(s: IncidentStats | null): Cell[] {
  const instantTotal = s?.instantClosures.reduce((a, r) => a + r.count, 0) ?? 0;
  return [
    { label: 'ABIERTOS', value: fmt(s?.openTotal ?? 0), note: `${fmt(s?.unassignedOpenCount ?? 0)} sin operador asignado`, accent: true },
    { label: 'CERRADOS (30 D)', value: fmt(s?.recentClosedCount ?? 0), note: instantTotal > 0 ? `${fmt(instantTotal)} se cierran solas` : '' },
    { label: 'ANTIGÜEDAD MEDIA', value: fmtAging(s?.avgAgingSeconds ?? 0), note: 'de los abiertos', accent: true },
    { label: 'CREADOS MANUALMENTE', value: fmt(s?.byOrigin.manual ?? 0), note: `${fmt(s?.byOrigin.auto ?? 0)} automáticos` },
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

interface Props { stats: IncidentStats | null; loading: boolean; error: boolean; onRetry: () => void }

/** Tira de 4 de Incidentes (handoff hifi #3, fase 4) — mismo criterio que
 * `AlertsMetricsPanel`: vive en la mitad izquierda de un grid de 2 columnas
 * junto a `IncidentsByClassPanel` (`Incidentes.dc.html:37-38`, `auto-fit,
 * minmax(160px,1fr)` de ANCHO DE CONTENEDOR, no de viewport) — por eso no
 * reutiliza `shared/MetricsStrip` (fuerza columnas fijas de viewport). */
export default function IncidentsMetricsPanel({ stats, loading, error, onRetry }: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400">
      {buildCells(stats).map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
