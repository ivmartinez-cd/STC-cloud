import { X } from 'lucide-react';

export interface ScopeChip {
  /** Qué acota: "Cliente", "Equipo", "Clase". */
  kind: string;
  /** Nombre legible; si el filtro no devolvió filas puede no conocerse. */
  value?: string;
  onClear: () => void;
}

/**
 * Filtros de alcance que llegan por deep-link (`?client_id=`, `?device_id=`,
 * `?class=`) y no tienen chip propio en la barra. Sin esto el usuario veía una
 * lista recortada sin ninguna señal de por qué (auditoría 12/09/2026): pasaba
 * de Cliente Detalle a Alertas y la tabla quedaba filtrada por ese cliente
 * para siempre, sin forma visible de quitarlo.
 */
export default function ScopeChips({ chips }: { chips: ScopeChip[] }) {
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span key={c.kind} className="inline-flex items-center gap-1.5 rounded-[3px] border border-brand-chip-border bg-brand-soft px-2.5 py-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent">
          {c.kind}: {c.value ?? '—'}
          <button
            type="button" onClick={c.onClear} aria-label={`Quitar filtro por ${c.kind.toLowerCase()}`}
            className="rounded-[2px] text-brand-accent transition-colors duration-150 ease-in-out hover:text-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </>
  );
}
