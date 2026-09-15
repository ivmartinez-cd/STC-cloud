import { useEffect, useMemo, useState } from 'react';
import {
  RANGES, RANGE_LABELS, type SupplyHistory, type SupplyHistoryRange,
} from '../../types/supplyHistory';
import { SWATCH_HEX } from '../../lib/supplyColors';
import { sliceByRange } from './chartGeometry';
import SupplyLevelChart from './SupplyLevelChart';
import SupplyCountersChart from './SupplyCountersChart';
import SupplyRangeBrush, { type BrushWindow } from './SupplyRangeBrush';
import { Card, CardTitle, LegendDot } from './primitives';

function RangeChips({ active, onPick }: { active: SupplyHistoryRange; onPick: (r: SupplyHistoryRange) => void }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r} type="button" onClick={() => onPick(r)}
          className={`rounded-[3px] px-2.5 py-1 font-montserrat text-[9px] font-bold uppercase tracking-[.12em] transition-colors duration-150 ${
            active === r ? 'bg-ink-900 text-white' : 'bg-surface-track text-ink-400 hover:bg-line-400'
          }`}
        >{RANGE_LABELS[r]}</button>
      ))}
    </div>
  );
}

const COUNTER_LEGEND = [
  { colorClass: 'bg-brand-muted', label: 'Monocromo' },
  { colorClass: 'bg-brand', label: 'Color' },
  { colorClass: 'bg-ink-900', label: 'Ciclos de trabajo' },
];

/**
 * Columna central: nivel + contadores acumulados + selector de ventana.
 * El recorte se hace SIEMPRE sobre los mismos puntos que trajo la API — los
 * chips 12M/24M/TODO sólo mueven la ventana del brush, no refetchean.
 */
export default function SupplyHistoryPanel({ history }: { history: SupplyHistory }) {
  const { points } = history;
  const [range, setRange] = useState<SupplyHistoryRange>('12m');
  const [win, setWin] = useState<BrushWindow>({ from: 0, to: Math.max(0, points.length - 1) });

  // Un chip de rango reposiciona la ventana; arrastrar el brush la pisa después.
  useEffect(() => {
    const sliced = sliceByRange(points, range);
    const from = points.length - sliced.length;
    setWin({ from: Math.max(0, from), to: Math.max(0, points.length - 1) });
  }, [range, points]);

  const visible = useMemo(() => points.slice(win.from, win.to + 1), [points, win]);
  const fill = history.supply.color !== 'Sin color' ? SWATCH_HEX[history.supply.color] : '#F7941D';

  if (!points.length) {
    return (
      <Card className="flex h-full items-center justify-center p-10 text-center">
        <p className="font-sans text-[12.5px] text-ink-300">
          Todavía no hay lecturas diarias agregadas para este equipo. El histórico aparece con el primer refresco del agregado (cada hora).
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <CardTitle right={<RangeChips active={range} onPick={setRange} />}>Historial del nivel de consumibles</CardTitle>
        <div className="px-4 pb-2 pt-3">
          {history.supply.kind === 'Tóner' ? (
            <SupplyLevelChart points={visible} replacements={history.replacements} fillColor={fill} />
          ) : (
            <p className="py-10 text-center font-sans text-[12px] text-ink-300">
              El histórico de nivel sólo se conserva para tóners. Para {history.supply.description.toLowerCase()} se muestra el nivel actual y los contadores.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle right={<span className="flex gap-4">{COUNTER_LEGEND.map((l) => <LegendDot key={l.label} {...l} />)}</span>}>
          Contadores acumulados
        </CardTitle>
        <div className="px-4 pb-2 pt-3">
          <SupplyCountersChart points={visible} />
        </div>
        <div className="border-t border-line-150 px-4 py-2">
          <SupplyRangeBrush points={points} window={win} onChange={setWin} />
        </div>
      </Card>
    </div>
  );
}
