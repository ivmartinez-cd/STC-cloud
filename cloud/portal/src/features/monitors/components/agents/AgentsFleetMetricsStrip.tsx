import { fmt, fmtPct } from '../../../../shared/lib/formatters';
import type { AgentFleetSummary } from '../../types/agentsDirectory';

interface Cell { label: string; value: string; note?: string; accent?: boolean; }

function Metric({ cell }: { cell: Cell }) {
  return (
    <div>
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{cell.label}</div>
      <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>
        {cell.value}
      </div>
      <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{cell.note}</div>
    </div>
  );
}

function buildCells(summary: AgentFleetSummary | null): Cell[] {
  return [
    { label: 'Nodos registrados', value: fmt(summary?.agents_total ?? 0), note: `en ${fmt(summary?.clients_total ?? 0)} clientes` },
    {
      label: 'Sin señal +6h', value: fmt(summary?.stale_over_6h ?? 0), accent: true,
      note: summary ? `${fmtPct(summary.stale_over_6h, summary.agents_total)} del total` : undefined,
    },
    {
      label: 'Agente desactualizado', value: fmt(summary?.outdated ?? 0), accent: true,
      note: summary ? `publicada v${summary.published_version}` : undefined,
    },
    { label: 'Llave por vencer', value: fmt(summary?.key_expiring_30d ?? 0), note: 'rotación en 30 días' },
  ];
}

/** 4-métrica de flota (handoff hifi "Salud de nodos", panel izquierdo de la fila
 * de 2 columnas) — anatomía de celda recreada LOCALMENTE (README: label/valor/nota),
 * no importa `PortfolioMetricsStrip` (otra feature) ni el layout de 6 columnas de
 * `MonitorMetricsStrip` (shape de datos distinto, aunque sí es de esta misma feature). */
export default function AgentsFleetMetricsStrip({
  summary, loading, error, onRetry,
}: {
  summary: AgentFleetSummary | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button
          type="button" onClick={onRetry}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-[5px] border border-line-100 bg-white p-[18px]">
      {buildCells(summary).map((c) => (
        loading
          ? <span key={c.label} className="block h-[46px] w-full animate-pulse rounded bg-surface-track" />
          : <Metric key={c.label} cell={c} />
      ))}
    </div>
  );
}
