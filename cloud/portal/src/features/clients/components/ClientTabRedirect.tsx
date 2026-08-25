import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

/**
 * Contenido de las tabs "Alertas"/"Consumibles" del detalle de cliente. El README
 * del handoff sólo documenta "Resumen" en detalle ("las demás pestañas reusan la
 * tabla... a pantalla completa"); acá se interpreta literalmente: en vez de
 * duplicar `AlertsTable`/`Supplies` (con su propia selección múltiple, incidentes,
 * exportación) dentro de esta pestaña, se linkea a la pantalla completa REAL ya
 * filtrada por este cliente (`?client_id=`) — ninguna tabla a medio construir.
 */
export default function ClientTabRedirect({
  icon: Icon, title, description, href, cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-[5px] border border-line-100 bg-white px-6 py-16 text-center">
      <Icon size={32} className="text-ink-300" />
      <p className="font-montserrat text-sm font-bold text-ink-900">{title}</p>
      <p className="max-w-[46ch] font-sans text-[12.5px] text-ink-300">{description}</p>
      <Link
        to={href}
        className="mt-1 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe"
      >
        {cta}
      </Link>
    </div>
  );
}
