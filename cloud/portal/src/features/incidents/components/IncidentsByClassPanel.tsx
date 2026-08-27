import type { IncidentClassAging } from '../../../shared/types/incidents';
import { classAccent, fmtAging } from '../lib/incidentPresentation';
import { fmt } from '../../../shared/lib/formatters';
import CardError from '../../../shared/components/CardError';

function ClassRow({ row, max, classLabels }: { row: IncidentClassAging; max: number; classLabels: Record<string, string> }) {
  const barPct = Math.max(1.5, max > 0 ? (row.count / max) * 100 : 0);
  const accent = classAccent(row.class);
  return (
    <div className="grid grid-cols-[8px_minmax(0,1fr)_1fr_112px] items-center gap-[11px] border-b border-line-200 py-2 last:border-b-0">
      <span className={`block h-[7px] w-[7px] rounded-full ${accent}`} />
      <span className="truncate font-sans text-[12.5px] text-ink-700">{classLabels[row.class] ?? row.class}</span>
      <span className="block h-1.5 rounded-[3px] bg-surface-track">
        <span className={`block h-full rounded-[3px] ${accent}`} style={{ width: `${barPct}%` }} />
      </span>
      <span className="text-right font-sans text-[11.5px] text-ink-400">{fmt(row.count)} · {fmtAging(row.avgAgingSeconds)} prom.</span>
    </div>
  );
}

interface Props {
  byClass: IncidentClassAging[];
  classLabels: Record<string, string>;
  openTotal: number;
  avgAgingSeconds: number;
  maxAgingSeconds: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const MAX_CLASSES = 6;

function PanelBody({ byClass, classLabels, avgAgingSeconds, maxAgingSeconds, loading, error, onRetry }: Omit<Props, 'openTotal'>) {
  if (error) return <CardError onRetry={onRetry} />;
  if (loading) return <div className="h-[120px] animate-pulse rounded bg-surface-track" />;
  if (byClass.length === 0) return <div className="py-6 text-center font-sans text-[12.5px] text-ink-300">Sin incidentes abiertos</div>;
  const max = byClass[0]?.count ?? 0;
  // Sólo las 6 clases con más abiertos — mismo criterio que `AlertsByCodePanel`.
  const shown = byClass.slice(0, MAX_CLASSES);
  const hidden = byClass.length - shown.length;
  return (
    <>
      {shown.map((row) => <ClassRow key={row.class} row={row} max={max} classLabels={classLabels} />)}
      {hidden > 0 && <div className="mt-2 font-sans text-[11.5px] text-ink-300">y {hidden} clase{hidden === 1 ? '' : 's'} más con menos abiertos</div>}
      <div className="mt-3 font-sans text-[11.5px] leading-[1.5] text-ink-400">
        Antigüedad media de los abiertos: <strong className="font-semibold text-brand-accent">{fmtAging(avgAgingSeconds)}</strong> · el más viejo lleva {fmtAging(maxAgingSeconds)}.
      </div>
    </>
  );
}

/** "Abiertos por clase y antigüedad" (handoff hifi #3, fase 4) — mismo patrón
 * visual que `AlertsByCodePanel` (Fase 1), adaptado: barra por clase +
 * antigüedad promedio en vez de código + %. */
export default function IncidentsByClassPanel({ openTotal, loading, error, ...rest }: Props) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 border-t-[3px] border-t-brand-accent bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-150 px-5 py-[14px]">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">ABIERTOS POR CLASE Y ANTIGÜEDAD</span>
        {!loading && !error && <span className="font-sans text-[11.5px] text-ink-300">{fmt(openTotal)} abiertos</span>}
      </div>
      <div className="px-5 pb-4 pt-3"><PanelBody loading={loading} error={error} {...rest} /></div>
    </div>
  );
}
