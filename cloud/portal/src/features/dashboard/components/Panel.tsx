import type { ReactNode } from 'react';

/**
 * Superficie única del panel de control (handoff "Panel de control",
 * 16/09/2026, segunda tanda): fondo blanco, borde hairline de 1px y nada más
 * — sin radio, sin sombra, sin tarjetas anidadas. Todo el contenido del panel
 * vive sobre el lienzo cálido a un solo nivel de profundidad.
 *
 * Reemplaza a `SectionHead`, que resolvía la jerarquía con una regla suelta
 * sobre el fondo de la página: al sumarse los paneles de la columna lateral,
 * secciones sin caja y secciones con caja convivían mal en la misma grilla.
 *
 * `foot` es la línea de contexto del pie ("5 marcas · 169 equipos"), separada
 * del cuerpo por el padding, no por otra regla.
 */
export function PanelHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-b border-line-150 pb-3">
      <span className="font-montserrat text-[10px] font-semibold uppercase leading-none tracking-[.14em] text-ink-300">{title}</span>
      {right}
    </div>
  );
}

export function PanelFoot({ children }: { children: ReactNode }) {
  return <p className="m-0 pt-3 font-sans text-[12px] leading-[1.5] text-ink-400">{children}</p>;
}

/** Meta de cabecera: cifra mono + texto ("281 activas · +12 en 7 días"). */
export function PanelMeta({ children }: { children: ReactNode }) {
  return <span className="font-sans text-[12px] text-ink-400">{children}</span>;
}

export default function Panel({ title, right, children, className = '' }: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 border border-line-100 bg-white px-[22px] pb-4 pt-[18px] short:px-4 short:pb-3 short:pt-3.5 ${className}`}>
      <PanelHead title={title} right={right} />
      {children}
    </section>
  );
}
