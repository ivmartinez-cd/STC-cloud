import type { CSSProperties } from 'react';
import { Row } from './primitives';
import { fmtInt } from '../../../../shared/lib/supplies';
import type { CounterRowDetail, CounterTriple, DetailedCounters, ScanCounters } from '../../../../shared/types/monitor';

type Cell = number | null | undefined;
interface TableRow { label: string; cells: Cell[]; strong?: boolean }

const HEAD = 'font-montserrat text-[8.5px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300';

const LINE = 'grid items-baseline gap-x-5 border-b border-line-200 py-[7px] short:py-1';
const CELL = 'font-sans text-[12.5px] leading-[1.3]';

function TableLine({ row, columns, template }: { row: TableRow; columns: string[]; template: CSSProperties }) {
  const last = row.cells.length - 1;
  return (
    <div className={LINE} style={template}>
      <span className={`${CELL} ${row.strong ? 'font-semibold text-ink-900' : 'text-ink-800'}`}>{row.label}</span>
      {row.cells.map((v, i) => (
        <span key={columns[i]} className={`${CELL} text-right tabular-nums ${i === last || row.strong ? 'font-semibold text-ink-900' : 'text-ink-800'} ${row.strong && i === last ? 'text-brand-accent' : ''}`}>
          {fmtInt(v)}
        </span>
      ))}
    </div>
  );
}

/** Tabla compacta "fila → N columnas numéricas": reemplaza a las filas
 * "a / b / c", que obligaban a leer el orden de los valores en la etiqueta. */
function BreakdownTable({ title, columns, rows }: { title: string; columns: string[]; rows: TableRow[] }) {
  if (rows.length === 0) return null;
  const template = { gridTemplateColumns: `minmax(0,1fr) repeat(${columns.length}, minmax(64px,auto))` };
  return (
    <div className="mb-3 last:mb-0">
      <div className={LINE} style={template}>
        <span className={`${HEAD} text-ink-600`}>{title}</span>
        {columns.map(c => <span key={c} className={`${HEAD} text-right`}>{c}</span>)}
      </div>
      {rows.map(r => <TableLine key={r.label} row={r} columns={columns} template={template} />)}
    </div>
  );
}

function functionRows(c: DetailedCounters, withColor: boolean): TableRow[] {
  const entries: Array<[string, CounterTriple | undefined]> = [
    ['Impresión', c.print], ['Copia', c.copy], ['Fax', c.fax], ['Dúplex (equiv.)', c.duplexEquivalent],
  ];
  return entries.flatMap(([label, t]) => (t ? [{ label, cells: withColor ? [t.mono, t.color, t.total] : [t.total] }] : []));
}

function sidesRows(c: DetailedCounters, isColor: boolean): TableRow[] {
  const entries: Array<[string, CounterRowDetail | undefined]> = isColor
    ? [['Mono símplex', c.monoSimplex], ['Mono dúplex', c.duplex], ['Color símplex', c.colorSimplex], ['Color dúplex', c.colorDuplex]]
    : [['Símplex', c.monoSimplex], ['Dúplex', c.duplex]];
  const rows: TableRow[] = entries.flatMap(([label, d]) => (d ? [{ label, cells: [d.print, d.report, d.total] }] : []));
  if (rows.length > 0 && c.totalImpressions) {
    const t = c.totalImpressions;
    rows.push({ label: 'Total', cells: [t.print, t.report, t.total], strong: true });
  }
  return rows;
}

function scanRows(scans: ScanCounters | undefined): TableRow[] {
  if (!scans) return [];
  return [
    { label: 'Copia', cells: [scans.copy] },
    { label: 'Envío digital', cells: [scans.send] },
    { label: 'Fax', cells: [scans.fax] },
    { label: 'Total', cells: [scans.total], strong: true },
  ];
}

const Legend = ({ swatch, label, share }: { swatch: string; label: string; share: number }) => (
  <span className="inline-flex items-center gap-1.5 font-sans text-[11.5px] text-ink-600">
    <span className={`h-2 w-2 rounded-[2px] ${swatch}`} />
    {label} <span className="font-semibold tabular-nums text-ink-900">{(Math.round(share * 1000) / 10).toLocaleString('es-AR')} %</span>
  </span>
);

/** Barra símplex vs dúplex: la proporción es lo que se quiere leer de un vistazo. */
function SidesBar({ c }: { c: DetailedCounters }) {
  const simplex = (c.monoSimplex?.total ?? 0) + (c.colorSimplex?.total ?? 0);
  const duplex = (c.duplex?.total ?? 0) + (c.colorDuplex?.total ?? 0);
  const sum = simplex + duplex;
  if (sum <= 0) return null;
  return (
    <div className="pb-3 pt-2.5">
      <div className="mb-2 flex h-2 overflow-hidden rounded-[4px] bg-line-200">
        <div className="bg-brand-gray" style={{ width: `${(simplex / sum) * 100}%` }} />
        <div className="bg-brand" style={{ width: `${(duplex / sum) * 100}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <Legend swatch="bg-brand-gray" label="Símplex" share={simplex / sum} />
        <Legend swatch="bg-brand" label="Dúplex" share={duplex / sum} />
      </div>
    </div>
  );
}

export default function FunctionBreakdown({ counters: c, isColor }: { counters: DetailedCounters; isColor: boolean }) {
  return (
    <div className="px-5 pb-[18px] pt-2">
      <SidesBar c={c} />
      <BreakdownTable title="Caras" columns={['Impresión', 'Informes', 'Total']} rows={sidesRows(c, isColor)} />
      <BreakdownTable title="Función" columns={isColor ? ['Mono', 'Color', 'Total'] : ['Total']} rows={functionRows(c, isColor)} />
      <BreakdownTable title="Escaneos" columns={['Total']} rows={scanRows(c.scans)} />
      {isColor && c.colorEngineCycles != null && <Row label="Ciclos del motor en color" value={fmtInt(c.colorEngineCycles)} />}
    </div>
  );
}
