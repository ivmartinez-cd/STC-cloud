import { TREND_RANGES, TREND_RANGE_LABEL, type TrendRange } from '../../../shared/types/monitor';

/**
 * Selector de rango de la cabecera (handoff "Panel de control", 16/09/2026).
 * Cicla 7 días → 24 h → 30 días con un solo clic: son tres opciones y un
 * desplegable para tres opciones pesa más que lo que resuelve.
 *
 * Qué refiltra y qué no, a propósito: el rango es la ventana de la TENDENCIA
 * (sparklines, deltas del titular, columna de variación de clase y severidad).
 * Las cifras grandes no se mueven porque no son de período — "alertas activas"
 * es cuántas hay ABIERTAS ahora, y filtrarla por "últimas 24 h" daría un número
 * distinto que ya no sería el titular del panel. El propio chip lo dice en su
 * `title`.
 */
export default function RangeChip({ range, onChange }: {
  range: TrendRange;
  onChange: (r: TrendRange) => void;
}) {
  const next = TREND_RANGES[(TREND_RANGES.indexOf(range) + 1) % TREND_RANGES.length];
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={`Ventana de la tendencia — cambiar a ${TREND_RANGE_LABEL[next]}`}
      className="border border-line-100 bg-white px-3 py-2 font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-ink-700 transition-colors duration-[120ms] ease-in-out hover:border-line-hover hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
    >
      {TREND_RANGE_LABEL[range]}
    </button>
  );
}
