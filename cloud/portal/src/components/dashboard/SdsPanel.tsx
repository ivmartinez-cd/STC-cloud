import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Panel del Dashboard al estilo HP SDS: barra de título, cuerpo denso (tabla
 * de contadores, nunca una lista scrolleable) y enlace "Mostrar detalles…"
 * hacia la pantalla que sí tiene el listado completo. */
export default function SdsPanel({
  title, to, children, className = '', footer,
}: {
  title: string;
  /** Destino de "Mostrar detalles…" — si falta, el panel no ofrece drill-down. */
  to?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={`cd-panel overflow-hidden flex flex-col rounded-2xl ${className}`}>
      {/* Mismo degradé que el header del modal "Nuevo Cliente" (Clients.tsx). */}
      <h3 className="bg-gradient-to-r from-brand to-brand-gray text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 text-center truncate">
        {title}
      </h3>
      <div className="flex-1 min-w-0">{children}</div>
      {(to || footer) && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-t border-slate-100 bg-slate-50/60">
          <span className="text-[9px] font-bold text-slate-500 truncate">{footer}</span>
          {to && (
            <Link to={to} className="text-[9px] font-extrabold uppercase tracking-widest text-brand hover:underline shrink-0">
              Mostrar detalles…
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
