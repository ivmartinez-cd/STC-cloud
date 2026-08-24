import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/**
 * Barra sticky de acciones en bloque (Fase 9 del gap analysis vs HP SDS) —
 * un único componente reusado por `DeviceInventoryTable.tsx`/`Alerts.tsx`/
 * `Supplies.tsx` para que las tres tablas seleccionables se vean y se
 * comporten igual. Oculta por completo si no hay nada seleccionado.
 */
export default function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;
  return (
    <div className="cd-panel bg-brand/5 border border-brand/20 rounded-2xl px-5 py-3 flex items-center gap-3 sticky top-2 z-10 flex-wrap">
      <span className="text-xs font-extrabold text-brand-charcoal whitespace-nowrap">{count} seleccionado(s)</span>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      <div className="flex-1" />
      <button onClick={onClear} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white/60 transition-colors" title="Limpiar selección">
        <X size={16} />
      </button>
    </div>
  );
}
