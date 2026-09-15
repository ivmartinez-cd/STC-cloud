import { useRef, useState } from 'react';
import type { SupplyLevelPoint } from '../../types/supplyHistory';
import { BRUSH_PLOT, VIEW_W, monthTicks, stepAreaPath } from './chartGeometry';

const P = BRUSH_PLOT;
const MIN_SPAN = 7;

export interface BrushWindow {
  from: number;
  to: number;
}

type DragMode = 'from' | 'to' | 'pan' | null;

interface Props {
  points: SupplyLevelPoint[];
  window: BrushWindow;
  onChange: (w: BrushWindow) => void;
}

function clampWindow(from: number, to: number, n: number): BrushWindow {
  const lo = Math.max(0, Math.min(from, n - 1 - MIN_SPAN));
  const hi = Math.min(n - 1, Math.max(to, lo + MIN_SPAN));
  return { from: lo, to: hi };
}

/**
 * Selector de ventana sobre la serie completa (la tira de abajo del SDS).
 * Trabaja en ÍNDICES de la serie, no en fechas: así el recorte que ve el
 * gráfico grande es exactamente el mismo array, sin reinterpolar nada.
 */
export default function SupplyRangeBrush({ points, window, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<DragMode>(null);
  const panRef = useRef({ startIndex: 0, from: 0, to: 0 });
  const n = points.length;
  if (n < 2) return null;

  const xOf = (i: number) => (i / (n - 1)) * VIEW_W;
  const indexOf = (clientX: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    return Math.round(((clientX - box.left) / box.width) * (n - 1));
  };

  const start = (m: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    panRef.current = { startIndex: indexOf(e.clientX), from: window.from, to: window.to };
    setMode(m);
  };

  const move = (e: React.PointerEvent) => {
    if (!mode) return;
    const i = indexOf(e.clientX);
    if (mode === 'from') return onChange(clampWindow(i, window.to, n));
    if (mode === 'to') return onChange(clampWindow(window.from, i, n));
    const shift = i - panRef.current.startIndex;
    const span = panRef.current.to - panRef.current.from;
    const from = Math.max(0, Math.min(n - 1 - span, panRef.current.from + shift));
    return onChange({ from, to: from + span });
  };

  const x1 = xOf(window.from), x2 = xOf(window.to);
  return (
    <svg
      ref={svgRef} viewBox={`0 0 ${VIEW_W} ${P.h}`} className="h-auto w-full touch-none select-none"
      onPointerMove={move} onPointerUp={() => setMode(null)} onPointerCancel={() => setMode(null)}
    >
      <path d={stepAreaPath({ values: points.map((p) => p.level), max: 100, plot: P })} fill="#DDE1E2" />
      <rect x={0} y={0} width={x1} height={P.h - P.padB} fill="#FBFCFC" fillOpacity={0.8} />
      <rect x={x2} y={0} width={VIEW_W - x2} height={P.h - P.padB} fill="#FBFCFC" fillOpacity={0.8} />
      <rect
        x={x1} y={0} width={Math.max(2, x2 - x1)} height={P.h - P.padB}
        fill="#F7941D" fillOpacity={0.1} stroke="#F7941D" strokeWidth={1}
        className="cursor-grab" onPointerDown={start('pan')}
      />
      {[{ x: x1, m: 'from' as const }, { x: x2, m: 'to' as const }].map((h) => (
        <rect
          key={h.m} x={h.x - 4} y={0} width={8} height={P.h - P.padB}
          fill="#F7941D" fillOpacity={mode === h.m ? 0.9 : 0.55} className="cursor-ew-resize"
          onPointerDown={start(h.m)}
        />
      ))}
      {monthTicks(points, P, 8).map((t) => (
        <text key={t.x} x={t.x} y={P.h - 3} textAnchor="middle" fontSize={7.5} fill="#A5AAAD" fontWeight={700} letterSpacing="0.06em">{t.label}</text>
      ))}
    </svg>
  );
}
