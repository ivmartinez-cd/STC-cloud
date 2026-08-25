import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/**
 * Barra de acciones en bloque (Fase 9 del gap analysis vs HP SDS) — un único
 * componente reusado por `DeviceInventoryTable.tsx`/`ClientDevicesTable.tsx`/
 * `Alerts.tsx`/`Supplies.tsx`. Oculta por completo si no hay nada
 * seleccionado. Fondo `#FDF4E9` (handoff hifi "Monitor — detalle", §5 punto 8:
 * "barra de acciones masivas sobre fondo #FDF4E9").
 */
export default function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-chip-border bg-brand-soft px-5 py-3">
      <span className="whitespace-nowrap font-montserrat text-[10.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">{count} seleccionado(s)</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex-1" />
      <button onClick={onClear} className="rounded-[3px] p-1.5 text-brand-accent transition-colors duration-150 ease-in-out hover:bg-white/60" title="Limpiar selección">
        <X size={15} />
      </button>
    </div>
  );
}
