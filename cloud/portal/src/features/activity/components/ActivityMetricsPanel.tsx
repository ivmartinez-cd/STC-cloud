import { fmt } from '../../../shared/lib/formatters';
import type { AuditSummary } from '../../../shared/types/audit';

interface Cell { label: string; value: string; note: string; accent?: boolean }

function buildCells(s: AuditSummary | null): Cell[] {
  return [
    { label: 'EVENTOS EN EL RANGO', value: fmt(s?.total ?? 0), note: s ? `${fmt(s.per_day)} por día` : '' },
    { label: 'ALTAS DE EQUIPOS', value: fmt(s?.device_registrations ?? 0), note: `${fmt(s?.device_decommissions ?? 0)} bajas` },
    { label: 'CAMBIOS DE CONFIGURACIÓN', value: fmt(s?.config_changes ?? 0), note: '', accent: (s?.config_changes ?? 0) > 0 },
    { label: 'OPERADORES ACTIVOS', value: fmt(s?.distinct_users ?? 0), note: s?.top_operator ? `${fmt(s.top_operator.count)} eventos de ${s.top_operator.username}` : '' },
  ];
}

function MetricCell({ cell, loading }: { cell: Cell; loading: boolean }) {
  return (
    <div className="bg-white px-[18px] pb-4 pt-[15px]">
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

interface Props { summary: AuditSummary | null; loading: boolean; error: boolean; onRetry: () => void }

/** Tira de 4 de Movimientos (handoff hifi #3, fase 5) — mismo criterio de
 * ancho-de-contenedor que `AlertsMetricsPanel`/`IncidentsMetricsPanel` (vive
 * a la mitad de un grid de 2 columnas junto a `ActivityByCategoryPanel`). */
export default function ActivityMetricsPanel({ summary, loading, error, onRetry }: Props) {
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
      {buildCells(summary).map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
