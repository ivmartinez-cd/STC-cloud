/** Chip de estado unificado (handoff hifi, transversal #6): dos variantes —
 * `neutral` (estados normales) y `attention` (lo que requiere acción) —
 * siempre con texto, nunca sólo color. Antes duplicado en
 * `DeviceInventoryTable.tsx`/`ClientDevicesTable.tsx` con el mismo markup y
 * distinta etiqueta; esta es la única implementación.
 *
 * `dotClassName` (opcional, agregado para "Salud de nodos" — handoff hifi
 * 25/08/2026): override del color del punto sin tocar el fondo/texto de la
 * variante. Hace falta porque ese listado tiene un 3er estado visual
 * (INACTIVO) que comparte fondo/texto con `attention` (SIN SEÑAL) pero un
 * punto distinto (`brand-severe` en vez de `brand`) — agregar una 3ra
 * variante hubiera duplicado el fondo/texto de `attention` sin necesidad.
 * Retrocompatible: ausente, el dot por default de cada variante no cambia.
 *
 * Nunca se parte en dos renglones (27/08/2026): en una columna angosta el
 * texto se trunca con `…` en vez de duplicar el alto de la fila. */
export default function EstadoChip({
  label, variant, dotClassName,
}: {
  label: string;
  variant: 'neutral' | 'attention';
  dotClassName?: string;
}) {
  if (variant === 'neutral') {
    return (
      <span className="inline-flex max-w-full items-center gap-[6px] justify-self-start whitespace-nowrap rounded-[2px] bg-surface-avatar px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-650">
        <span className={`block h-1.5 w-1.5 rounded-full ${dotClassName ?? 'bg-severity-ok'}`} /> <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-[6px] justify-self-start whitespace-nowrap rounded-[2px] bg-brand-soft px-[9px] py-1 font-montserrat text-[9.5px] font-semibold uppercase tracking-[.08em] text-brand-accent">
      <span className={`block h-1.5 w-1.5 rounded-full ${dotClassName ?? 'bg-severity-critical'}`} /> <span className="truncate">{label}</span>
    </span>
  );
}
