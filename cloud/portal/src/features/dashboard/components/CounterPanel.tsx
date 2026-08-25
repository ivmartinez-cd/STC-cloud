import { Link } from 'react-router-dom';
import { fmt } from '../../../shared/lib/formatters';
import CardError from './CardError';
import SkeletonBlock from './Skeleton';

export interface CounterCell { label: string; value: number }

const VALUE_COLOR = ['text-ink-900', 'text-ink-100', 'text-brand-severe'];

function Cell({ cell, index, alignRight }: { cell: CounterCell; index: number; alignRight: boolean }) {
  return (
    <div className={alignRight ? 'text-right' : undefined}>
      <div className="font-sans text-[10.5px] leading-[1.3] text-ink-300">{cell.label}</div>
      <div className={`font-montserrat text-[20px] font-bold leading-[1.3] tabular-nums ${VALUE_COLOR[index % VALUE_COLOR.length]}`}>
        {fmt(cell.value)}
      </div>
    </div>
  );
}

/** Tarjeta de cola del Panel de Control hifi: título + hasta tres cifras en
 * fila + "MOSTRAR DETALLE →". Toda la tarjeta es el elemento clicable
 * (hover: borde `#D5D9DA`, fondo `#FCFCFC` — README, "tarjetas clicables"). */
export default function CounterPanel({
  title, to, cells, className = '', loading, error, onRetry,
}: {
  title: string;
  to: string;
  cells: CounterCell[];
  className?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <Link
      to={to}
      className={`group flex flex-col rounded-[5px] border border-line-100 bg-white px-[18px] pt-4 pb-[15px] transition-[background,border-color] duration-[120ms] ease-in-out hover:border-line-300 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${className}`}
    >
      <div className="font-montserrat text-[9px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-600">{title}</div>

      {error ? (
        <div className="flex-1"><CardError onRetry={onRetry} className="py-4" /></div>
      ) : (
        <div className="mt-4 flex flex-1 items-start justify-between gap-2.5">
          {loading
            ? cells.map((c, i) => (
                <div key={c.label} className={i === cells.length - 1 && cells.length > 1 ? 'text-right' : undefined}>
                  <div className="font-sans text-[10.5px] leading-[1.3] text-ink-300">{c.label}</div>
                  <SkeletonBlock heightPx={20} widthPct={70} className="mt-1" />
                </div>
              ))
            : cells.map((c, i) => <Cell key={c.label} cell={c} index={i} alignRight={i === cells.length - 1 && cells.length > 1} />)}
        </div>
      )}

      <div className="mt-3.5 border-t border-surface-track pt-[11px] font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent">
        MOSTRAR DETALLE →
      </div>
    </Link>
  );
}
