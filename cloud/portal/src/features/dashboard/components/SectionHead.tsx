import type { ReactNode } from 'react';

/** Cabecera de sección del rediseño minimalista (handoff "Panel de control",
 * 16/09/2026): label micro en mayúsculas + regla hairline debajo, y el dato
 * agregado de la sección a la derecha sobre la misma línea base.
 *
 * Reemplaza a `SdsPanel`, que este rediseño retira: ya no hay caja blanca con
 * borde y radio alrededor de cada bloque — la jerarquía la resuelven las
 * reglas de 1px, las etiquetas micro y la cifra mono tabular. */
export default function SectionHead({ title, right, className = '' }: { title: string; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-line-100 pb-2.5 short:pb-2 ${className}`}>
      <span className="font-montserrat text-[10px] font-semibold uppercase leading-none tracking-[.14em] text-ink-300">{title}</span>
      {right}
    </div>
  );
}
