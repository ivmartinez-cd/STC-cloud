import { Link } from 'react-router-dom';
import SdsPanel from './SdsPanel';
import MiniBar, { type BarTone } from './MiniBar';

export interface CounterCell {
  label: string;
  value: number;
  /** Deep-link específico de la celda (si difiere del "Mostrar detalles" del panel). */
  to?: string;
  tone?: BarTone;
  /** 0-100 — dibuja una barra debajo del valor (proporción sobre el total). */
  pct?: number;
}

const TONE_TEXT: Record<BarTone, string> = {
  emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', slate: 'text-slate-700', brand: 'text-brand',
};

function CellValue({ cell }: { cell: CounterCell }) {
  const cls = `text-[13px] font-black tabular-nums ${cell.value > 0 && cell.tone ? TONE_TEXT[cell.tone] : 'text-[#1a2333]'}`;
  const body = (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={cls}>{cell.value.toLocaleString('es-AR')}</span>
      {cell.pct != null && <MiniBar pct={cell.pct} tone={cell.tone ?? 'emerald'} />}
    </span>
  );
  return cell.to ? <Link to={cell.to} className="hover:underline">{body}</Link> : body;
}

/** Tabla de contadores estilo SDS: fila de encabezados + fila "Total" con los
 * valores. Sin listas: cada número es un enlace a la pantalla con el detalle. */
export default function CounterPanel({
  title, to, cells, className, footer,
}: { title: string; to?: string; cells: CounterCell[]; className?: string; footer?: string }) {
  return (
    <SdsPanel title={title} to={to} className={className} footer={footer}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="w-12" />
            {cells.map((c) => (
              <th key={c.label} className="px-2 py-1 text-[9px] font-black text-slate-500 uppercase tracking-wider text-center leading-tight">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Total</td>
            {cells.map((c) => (
              <td key={c.label} className="px-2 py-1.5 text-center"><CellValue cell={c} /></td>
            ))}
          </tr>
        </tbody>
      </table>
    </SdsPanel>
  );
}
