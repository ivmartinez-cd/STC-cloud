import { useState } from 'react';
import type { SupplyLevelPoint, SupplyReplacement } from '../../types/supplyHistory';
import { APP_LOCALE } from '../../lib/formatters';
import {
  LEVEL_PLOT, VIEW_W, indexFromRatio, monthTicks, stepAreaPath, stepSegments, xAt, yAt,
} from './chartGeometry';

const P = LEVEL_PLOT;
const BASE_Y = P.h - P.padB;
const GRID = [0, 20, 40, 60, 80, 100];

function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

function Grid() {
  return (
    <g>
      {GRID.map((v) => (
        <g key={v}>
          <line x1={P.padL} x2={VIEW_W - P.padR} y1={yAt(v, 100, P)} y2={yAt(v, 100, P)} stroke="#F0F2F2" strokeWidth={1} />
          <text x={P.padL - 6} y={yAt(v, 100, P) + 3} textAnchor="end" fontSize={8} fill="#A5AAAD" fontWeight={700}>{v}</text>
        </g>
      ))}
    </g>
  );
}

/** Líneas punteadas "REEMPLAZO": el mismo salto de nivel que cierra un pedido automáticamente. */
function Replacements({ marks }: { marks: Array<{ x: number; at: string }> }) {
  return (
    <g>
      {marks.map((m) => (
        <g key={m.at}>
          <line x1={m.x} x2={m.x} y1={P.padT} y2={BASE_Y} stroke="#4B5053" strokeWidth={1} strokeDasharray="3 3" />
          <text x={m.x + 4} y={P.padT + 8} fontSize={7.5} fill="#4B5053" fontWeight={700} letterSpacing="0.1em">REEMPLAZO</text>
        </g>
      ))}
    </g>
  );
}

function Hover({ point, x }: { point: SupplyLevelPoint; x: number }) {
  if (point.level == null) return null;
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={P.padT} y2={BASE_Y} stroke="#B4B9BB" strokeWidth={1} />
      <circle cx={x} cy={yAt(point.level, 100, P)} r={3} fill="#F7941D" stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}

interface Props {
  points: SupplyLevelPoint[];
  replacements: SupplyReplacement[];
  fillColor: string;
}

/** "Historial del nivel de consumibles": escalera del % + marcas de reemplazo. */
export default function SupplyLevelChart({ points, replacements, fillColor }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.level);
  const area = stepAreaPath({ values, max: 100, plot: P });
  const lines = stepSegments({ values, max: 100, plot: P });
  const index = new Map(points.map((p, i) => [p.day, i]));
  const marks = replacements
    .filter((r) => index.has(r.at))
    .map((r) => ({ x: xAt(index.get(r.at)!, points.length, P), at: r.at }));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = ((e.clientX - box.left) / box.width * VIEW_W - P.padL) / (VIEW_W - P.padL - P.padR);
    setHover(indexFromRatio(ratio, points.length));
  };
  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VIEW_W} ${P.h}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <Grid />
        <path d={area} fill={fillColor} fillOpacity={0.14} />
        {lines.map((d) => <path key={d.slice(0, 24)} d={d} fill="none" stroke={fillColor} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
        <Replacements marks={marks} />
        {hovered && hover != null && <Hover point={hovered} x={xAt(hover, points.length, P)} />}
        {monthTicks(points, P).map((t) => (
          <text key={t.x} x={t.x} y={P.h - 5} textAnchor="middle" fontSize={8} fill="#A5AAAD" fontWeight={700} letterSpacing="0.06em">{t.label}</text>
        ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute right-2 top-1 rounded-[3px] border border-line-100 bg-white px-2.5 py-1.5 shadow-sm">
          <div className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.13em] text-ink-300">{fmtDay(hovered.day)}</div>
          <div className="font-montserrat text-[13px] font-extrabold tabular-nums text-ink-900">
            {hovered.level != null ? `${hovered.level}%` : 'Sin lectura'}
          </div>
        </div>
      )}
    </div>
  );
}
