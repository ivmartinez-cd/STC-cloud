import { fmt } from '../../../../shared/lib/formatters';
import type { RemoteActionDiagnostic } from '../../types/remoteActions';

function headlineOf(d: RemoteActionDiagnostic): string {
  const label = d.label.toUpperCase();
  return d.failed_count === d.total_count ? `TODOS LOS LOTES DE ${label} TERMINAN CON ERRORES` : `LA MAYORÍA DE LOS LOTES DE ${label} TERMINAN CON ERRORES`;
}

function BannerIcon() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[12px] font-bold text-white">!</span>
  );
}

function BannerBody({ diagnostic }: { diagnostic: RemoteActionDiagnostic }) {
  return (
    <div className="min-w-[240px] flex-1">
      <div className="font-montserrat text-[8.5px] font-bold uppercase leading-[1.4] tracking-[.13em] text-brand-accent">{headlineOf(diagnostic)}</div>
      <p className="mt-1 font-sans text-[12.5px] leading-[1.4] text-brand-warn-text">
        {fmt(diagnostic.failed_count)} de {fmt(diagnostic.total_count)} lotes de <strong className="font-semibold">{diagnostic.label}</strong> fallaron en los últimos 7 días. Probable causa: {diagnostic.probable_cause}.
      </p>
    </div>
  );
}

/** Banner de diagnóstico de "Acciones remotas" (handoff hifi "4 pantallas") —
 * SÓLO se renderiza cuando el backend detectó una falla sistémica
 * (`GET /remote-actions/by-type` → `diagnostic`). Qué tipo de acción falla y
 * las cifras vienen del servidor; acá sólo se arma la frase alrededor. Borde
 * cálido `#E0A76B` del handoff sin token exacto en `index.css` — se usa como
 * literal `border-[#E0A76B]` (más fiel que el token más cercano `brand-light`
 * #FBC486, bastante más claro). */
export default function DiagnosticBanner({ diagnostic, onDiagnose }: { diagnostic: RemoteActionDiagnostic; onDiagnose: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-[5px] border border-brand-chip-border bg-brand-soft p-4">
      <BannerIcon />
      <BannerBody diagnostic={diagnostic} />
      <button
        type="button" onClick={onDiagnose}
        className="rounded-[3px] border border-[#E0A76B] bg-white px-[14px] py-[9px] font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-warn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        DIAGNOSTICAR
      </button>
    </div>
  );
}
