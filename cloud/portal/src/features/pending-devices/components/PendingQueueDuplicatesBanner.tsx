import { fmt } from '../../../shared/lib/formatters';

function BannerIcon() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand font-montserrat text-[12px] font-bold text-white">!</span>
  );
}

interface Props { count: number; onMergeClick: () => void }

/** Aviso institucional siempre relevante mientras haya duplicados en la cola
 * (handoff hifi "Dispositivos pendientes", 25/08/2026) — mismo patrón
 * `brand-soft`/`brand-chip-border` que `DiagnosticBanner.tsx` (Acciones
 * remotas). Sólo se renderiza cuando `count > 0`. */
export default function PendingQueueDuplicatesBanner({ count, onMergeClick }: Props) {
  if (count <= 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-start gap-3 rounded-[5px] border border-brand-chip-border bg-brand-soft p-4">
      <BannerIcon />
      <div className="min-w-[240px] flex-1">
        <div className="font-montserrat text-[8.5px] font-bold uppercase leading-[1.4] tracking-[.13em] text-brand-accent">{fmt(count)} POSIBLES DUPLICADOS EN ESTA COLA</div>
        <p className="mt-1 font-sans text-[12.5px] leading-[1.4] text-brand-warn-text">
          Aprobarlos sin revisar duplica el equipo en la flota y el consumo que se factura al cliente. Usá <strong className="font-semibold">Fusionar con existente</strong> para consolidar cada uno contra el equipo que ya está en inventario.
        </p>
      </div>
      <button
        type="button" onClick={onMergeClick}
        className="rounded-[3px] border border-brand-chip-border bg-white px-[14px] py-[9px] font-montserrat text-[10px] font-semibold uppercase tracking-[.1em] text-brand-accent transition-colors duration-150 ease-in-out hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        REVISAR DUPLICADOS
      </button>
    </div>
  );
}
