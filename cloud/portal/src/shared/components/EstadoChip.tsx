/** Chip de estado unificado (handoff hifi, transversal #6): dos variantes —
 * `neutral` (estados normales) y `attention` (lo que requiere acción) —
 * siempre con texto, nunca sólo color. Antes duplicado en
 * `DeviceInventoryTable.tsx`/`ClientDevicesTable.tsx` con el mismo markup y
 * distinta etiqueta; esta es la única implementación. */
export default function EstadoChip({ label, variant }: { label: string; variant: 'neutral' | 'attention' }) {
  if (variant === 'neutral') {
    return (
      <span className="inline-flex items-center gap-[6px] justify-self-start rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
        <span className="block h-1.5 w-1.5 rounded-full bg-brand-gray" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[6px] justify-self-start rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
      <span className="block h-1.5 w-1.5 rounded-full bg-brand" /> {label}
    </span>
  );
}
