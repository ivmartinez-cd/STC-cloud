import type { ReactNode } from 'react';

/** Tarjeta con cabecera dividida del handoff hifi "Panel de Control"
 * (25/08/2026): fondo blanco, borde `#E2E6E6`, radio 5px, sin sombra;
 * cabecera con borde inferior `#EDEFEF` y título Montserrat 700 9px
 * `letter-spacing:.15em` `#4B5053`. La decisión de loading/error/empty vive
 * en cada tarjeta concreta (la forma del skeleton cambia por bloque) — acá
 * sólo el marco + la cabecera, reusado por Alertas por clase, Presencia de
 * monitores, Versiones del agente, Distribución de marcas y Top cuentas. */
export default function SdsPanel({
  title, headerRight, children, className = '', headerClassName = 'px-5 py-[15px]',
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <section className={`flex flex-col rounded-[5px] border border-line-100 bg-white ${className}`}>
      <div className={`flex items-baseline justify-between gap-3 border-b border-line-150 ${headerClassName}`}>
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">{title}</span>
        {headerRight}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}
