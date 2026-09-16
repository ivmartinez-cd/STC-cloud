import type { Series } from '../lib/trend';

/**
 * Variación del período bajo cada cifra del titular. El color no lo decide el
 * signo sino la DIRECCIÓN MALA de esa métrica (`worseWhen`): +12 alertas es
 * rojo y +3 equipos gestionados es verde, aunque los dos suban.
 *
 * Sin variación (mismo valor al principio y al final de la ventana) se dice
 * "sin cambios" en gris: un "0" mono al lado de una flecha se lee como si algo
 * hubiera pasado.
 */
export type WorseWhen = 'up' | 'down';

function toneOf(delta: number, worseWhen: WorseWhen): string {
  if (delta === 0) return 'text-ink-400';
  const worse = worseWhen === 'up' ? delta > 0 : delta < 0;
  return worse ? 'text-severity-critical' : 'text-severity-ok';
}

export default function KpiDelta({ series, worseWhen, note }: {
  series: Series;
  worseWhen: WorseWhen;
  note: string;
}) {
  const { delta } = series;
  if (delta === 0) {
    return <span className="font-sans text-[11px] text-ink-400">Sin cambios {note}</span>;
  }
  return (
    <span className={`flex items-center gap-1.5 font-sans text-[11px] ${toneOf(delta, worseWhen)}`}>
      <span aria-hidden="true">{delta > 0 ? '▲' : '▼'}</span>
      <span className="font-mono tabular-nums">{delta > 0 ? `+${delta}` : delta}</span>
      <span className="text-ink-400">{note}</span>
    </span>
  );
}
