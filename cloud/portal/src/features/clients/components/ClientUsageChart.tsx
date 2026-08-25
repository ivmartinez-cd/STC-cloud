import ErrorBoundary from '../../../shared/components/ErrorBoundary';
import type { UsageMonth } from '../../../shared/types/monitor';
import { currentMonthDelta, padTo12Months } from '../lib/usageMonths';
import { fmt } from '../../../shared/lib/formatters';

interface Props { usage: UsageMonth[]; }

/**
 * "Consumo mensual" (handoff hifi "Cliente — detalle", 25/08/2026) — 12 barras con
 * el mes actual destacado, escaladas sobre el máximo de los 12 meses (README).
 *
 * Reescrito de cero (antes: recharts con 2 series mono/color apiladas sobre los 4
 * meses que devolvía el backend). El bug real de "ilegible (una barra)" que describe
 * el README era la VENTANA de 4 meses del backend (corregida a 12, ver
 * `USAGE_BY_MONTH_SQL`): con datos recientes de un solo mes, 4 meses de ventana
 * devolvía 1 sola fila → recharts con una sola categoría en el eje X se ve como
 * "una barra". Aparte de eso, este componente SÍ tenía un bug propio de diseño (no
 * de datos): mono/color apilados en vez de una sola barra por mes, sin destacar el
 * mes actual — no pixel-perfect contra el handoff aunque el backend devolviera 12
 * meses. Se resuelve junto con lo del backend, con barras propias (mismo criterio
 * "sin librería" que ya usa el resto de esta vista para las barras de consumibles).
 */
function ChartContent({ usage }: Props) {
  const points = padTo12Months(usage);
  const { total, deltaPct } = currentMonthDelta(usage);
  const max = Math.max(...points.map((p) => p.total), 1);

  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-150 px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Consumo mensual</span>
        <span className="font-sans text-[11.5px] text-ink-300">12 meses · páginas</span>
      </div>
      <div className="px-5 pb-4 pt-[18px]">
        <div className="mb-4 flex items-baseline gap-2.5">
          <span className="font-montserrat text-[30px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900">{fmt(total)}</span>
          {deltaPct !== null && (
            <span className="rounded-[2px] bg-brand-soft px-2 py-1 font-montserrat text-[10.5px] font-semibold text-brand-accent">
              {deltaPct >= 0 ? '+' : ''}{deltaPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        <div className="flex h-[88px] items-end gap-1.5">
          {points.map((p) => (
            <div key={p.key} className="flex flex-1 flex-col items-center gap-[7px]">
              <div
                className={`w-full rounded-t-[2px] ${p.isCurrent ? 'bg-brand' : 'bg-surface-track-alt'}`}
                style={{ height: `${Math.max(6, Math.round((p.total / max) * 68) + 6)}px` }}
                title={`${p.labelShort}: ${fmt(p.total)}`}
              />
              <span className="font-montserrat text-[8.5px] font-semibold tracking-[.06em] text-chart-axis">{p.labelShort}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ClientUsageChart = ({ usage }: Props) => (
  <ErrorBoundary>
    <ChartContent usage={usage} />
  </ErrorBoundary>
);

export default ClientUsageChart;
