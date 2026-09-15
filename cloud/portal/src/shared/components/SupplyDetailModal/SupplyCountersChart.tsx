import type { SupplyLevelPoint } from '../../types/supplyHistory';
import { COUNTERS_PLOT, VIEW_W, linePath, monthTicks, niceMax, yAt } from './chartGeometry';

const P = COUNTERS_PLOT;

const SERIES = [
  { key: 'mono_pages', color: '#B4B9BB', label: 'Monocromo' },
  { key: 'color_pages', color: '#F7941D', label: 'Color' },
  { key: 'total_pages', color: '#2E3033', label: 'Ciclos de trabajo' },
] as const;

function compact(v: number): string {
  return v >= 1000 ? `${Math.round(v / 1000)}.000` : String(v);
}

/**
 * "Contadores acumulados": las tres series comparten eje porque el total
 * siempre contiene a las otras dos — dos escalas harían parecer que el
 * monocromo supera al total.
 */
export default function SupplyCountersChart({ points }: { points: SupplyLevelPoint[] }) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.total_pages ?? 0)));
  const ticks = [0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${P.h}`} className="h-auto w-full">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.padL} x2={VIEW_W - P.padR} y1={yAt(v, max, P)} y2={yAt(v, max, P)} stroke="#F0F2F2" strokeWidth={1} />
          <text x={P.padL - 6} y={yAt(v, max, P) + 3} textAnchor="end" fontSize={8} fill="#A5AAAD" fontWeight={700}>{compact(v)}</text>
        </g>
      ))}
      {SERIES.map((s) => (
        <path
          key={s.key}
          d={linePath(points.map((p) => p[s.key]), max, P)}
          fill="none" stroke={s.color} strokeWidth={1.4} vectorEffect="non-scaling-stroke"
        />
      ))}
      {monthTicks(points, P).map((t) => (
        <text key={t.x} x={t.x} y={P.h - 5} textAnchor="middle" fontSize={8} fill="#A5AAAD" fontWeight={700} letterSpacing="0.06em">{t.label}</text>
      ))}
    </svg>
  );
}
