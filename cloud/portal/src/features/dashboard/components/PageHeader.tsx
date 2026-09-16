import { Link } from 'react-router-dom';
import RangeChip from './RangeChip';
import type { TrendRange } from '../../../shared/types/monitor';

// Sin `tracking` acá a propósito: cada uso pasa el suyo (.16em el eyebrow,
// .12em el chip y la acción) y dos utilidades `tracking-[…]` en el mismo
// elemento se resolverían por orden de CSS, no por orden en el string.
const LABEL_MICRO = 'font-montserrat text-[10px] font-semibold uppercase leading-none';

/**
 * Cabecera de la página: eyebrow, título, chip de sincronización con la fecha
 * y, a la derecha, los dos controles de la pantalla — la ventana de la
 * tendencia y el alta de cliente.
 *
 * "+ Nuevo cliente" vuelve a ser un botón sólido (lo era hasta el rediseño de
 * agosto, que lo bajó a enlace subrayado para quitar ruido): con la página
 * ahora dividida en paneles blancos sobre lienzo, un enlace suelto arriba a la
 * derecha se perdía. Abre el alta de verdad — `?new=1`, lo lee `Clients.tsx`.
 */
export default function PageHeader({ eyebrow, synced, syncLabel, meta, action, range, onRangeChange }: {
  eyebrow: string;
  synced: boolean;
  syncLabel: string;
  meta: string | null;
  action: boolean;
  range: TrendRange;
  onRangeChange: (r: TrendRange) => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className={`${LABEL_MICRO} tracking-[.16em] text-ink-400`}>{eyebrow}</div>
        <h1 className="m-0 mt-2 font-montserrat text-[29px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink-900 short:text-[25px]">Panel de control</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-sans text-[12px] text-ink-400">
          <span className={`${LABEL_MICRO} flex items-center gap-1.5 tracking-[.1em] text-brand-accent`}>
            <span className="block h-[5px] w-[5px] rounded-full" style={{ background: synced ? 'var(--color-brand)' : 'var(--color-brand-severe)' }} />
            {synced ? `Sincronizado ${syncLabel}` : `Sin sincronizar${syncLabel ? ` · ${syncLabel}` : ''}`}
          </span>
          {meta && <span>{meta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <RangeChip range={range} onChange={onRangeChange} />
        {action && (
          <Link
            to="/clients?new=1"
            className={`${LABEL_MICRO} bg-ink-900 px-4 py-2.5 tracking-[.12em] text-white transition-colors duration-[120ms] ease-in-out hover:bg-brand-accent focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`}
          >
            + Nuevo cliente
          </Link>
        )}
      </div>
    </header>
  );
}
