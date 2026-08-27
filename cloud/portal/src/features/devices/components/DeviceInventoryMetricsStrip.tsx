import { fmt, fmtPct, pctOf } from '../../../shared/lib/formatters';
import type { DeviceInventorySummary } from '../types/deviceDirectory';

interface Cell {
  label: string;
  value: string;
  note?: string;
  bar?: number;
  accent?: boolean;
}

function buildCells(summary: DeviceInventorySummary | null): Cell[] {
  const reportingPct = summary ? pctOf(summary.reporting_24h, summary.devices_total) : 0;
  return [
    { label: 'Dispositivos', value: fmt(summary?.devices_total ?? 0), note: summary ? `${fmt(summary.devices_managed)} gestionados` : undefined },
    { label: 'Reportando 24 h', value: fmt(summary?.reporting_24h ?? 0), bar: reportingPct },
    { label: 'Sin contacto', value: fmt(summary?.no_contact ?? 0), accent: true, note: summary ? `${fmtPct(summary.no_contact, summary.devices_total)} del inventario` : undefined },
    { label: 'Consumible crítico', value: fmt(summary?.supply_critical ?? 0), accent: true, note: summary ? `${fmt(summary.supply_low)} en nivel bajo` : undefined },
    { label: 'Dados de baja', value: fmt(summary?.decommissioned ?? 0), note: 'ocultos del listado' },
  ];
}

function MetricCellFooter({ cell, loading }: { cell: Cell; loading: boolean }) {
  if (cell.bar != null) {
    return (
      <span className="mt-[7px] block h-1 w-full overflow-hidden rounded-[2px] bg-surface-track">
        <span className="block h-full rounded-[2px] bg-brand" style={{ width: `${loading ? 0 : Math.max(cell.bar, cell.bar > 0 ? 2 : 0)}%` }} />
      </span>
    );
  }
  return <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{loading ? ' ' : (cell.note ?? '')}</div>;
}

function MetricCell({ cell, loading }: { cell: Cell; loading: boolean }) {
  return (
    <div className="bg-white px-[18px] pb-4 pt-[15px] short:pb-2.5 short:pt-2.5">
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{cell.label}</div>
      {loading ? (
        <span className="mt-1.5 block h-[21px] w-3/5 animate-pulse rounded bg-surface-track" />
      ) : (
        <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>{cell.value}</div>
      )}
      <MetricCellFooter cell={cell} loading={loading} />
    </div>
  );
}

function MetricsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
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

interface Props {
  summary: DeviceInventorySummary | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Tira de 5 métricas del inventario global (handoff hifi "Inventario de dispositivos",
 * 25/08/2026) — endpoint aparte (`GET /devices/summary`), falla independiente de la
 * tabla. Mismo patrón de breakpoints explícitos que `PortfolioMetricsStrip.tsx`
 * (clientes) para el reflow 5→3→2→1 sin forzar scroll horizontal de la página. */
export default function DeviceInventoryMetricsStrip({ summary, loading, error, onRetry }: Props) {
  if (error) return <MetricsErrorState onRetry={onRetry} />;
  const cells = buildCells(summary);
  return (
    <div className="mb-4 short:mb-3 grid grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {cells.map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
