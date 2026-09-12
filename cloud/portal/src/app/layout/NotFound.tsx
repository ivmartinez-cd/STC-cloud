import { Link, useLocation } from 'react-router-dom';
import { SearchX } from 'lucide-react';

/** 404 dentro del layout. Antes el catch-all mandaba al Dashboard en silencio,
 * y así convivieron en producción cuatro links a rutas inexistentes
 * (`/monitoring`, `/pending-devices`) sin que nadie lo notara (auditoría 12/09/2026). */
export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="p-10 text-center">
      <div className="mx-auto max-w-xl rounded-[5px] border border-brand-chip-border bg-brand-soft p-12">
        <SearchX size={48} className="mx-auto mb-5 text-brand-severe" />
        <h2 className="mb-3.5 font-montserrat text-[19px] font-extrabold uppercase tracking-[.02em] text-ink-900">Página no encontrada</h2>
        <p className="mb-6 font-sans text-[13px] text-ink-700">
          No existe <code className="font-mono text-[12px]">{pathname}</code>. Si llegaste por un link del portal, avisanos con el botón de feedback.
        </p>
        <Link to="/" className="inline-flex items-center gap-2.5 rounded-[3px] bg-brand px-4 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[.08em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe">
          Ir al panel de control
        </Link>
      </div>
    </div>
  );
}
