export interface MetricCell {
  label: string;
  value: string;
  note?: string;
  bar?: number;
  accent?: boolean;
}

/** Sólo 4/5 columnas en xl — los únicos conteos que este handoff necesita.
 * Clases literales (Tailwind no puede generar `xl:grid-cols-${n}` dinámico). */
const XL_COLS: Record<number, string> = { 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5' };

function MetricCellFooter({ cell, loading }: { cell: MetricCell; loading: boolean }) {
  if (cell.bar != null) {
    return (
      <span className="mt-[7px] block h-1 w-full overflow-hidden rounded-[2px] bg-surface-track">
        <span className="block h-full rounded-[2px] bg-brand" style={{ width: `${loading ? 0 : Math.max(cell.bar, cell.bar > 0 ? 2 : 0)}%` }} />
      </span>
    );
  }
  return <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{loading ? ' ' : (cell.note ?? '')}</div>;
}

function MetricCell({ cell, loading }: { cell: MetricCell; loading: boolean }) {
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
  cells: MetricCell[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Tira de métricas genérica (handoff hifi #3, 26/08/2026) — extraída de
 * `features/devices/components/DeviceInventoryMetricsStrip.tsx`, que construía
 * las celdas desde un `summary` propio del inventario. Acá el caller arma
 * `cells[]` (cada pantalla tiene su propio summary/endpoint); este componente
 * sólo dibuja la grilla. Mismo criterio de breakpoints explícitos (nunca
 * `auto-fit`, ver `PortfolioMetricsStrip.tsx`) para no forzar scroll horizontal
 * de la página cuando la grilla no divide exacto. */
export default function MetricsStrip({ cells, loading, error, onRetry }: Props) {
  if (error) return <MetricsErrorState onRetry={onRetry} />;
  const xlCols = XL_COLS[cells.length] ?? 'xl:grid-cols-5';
  return (
    <div className={`mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 sm:grid-cols-2 md:grid-cols-3 ${xlCols}`}>
      {cells.map((c) => <MetricCell key={c.label} cell={c} loading={loading} />)}
    </div>
  );
}
