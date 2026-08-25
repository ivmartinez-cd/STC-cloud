import { fmt } from '../../../shared/lib/formatters';
import type { AgentStats } from '../types/monitorDetail';

const R = 45;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** "Equipos del sitio" (handoff hifi "Monitor — detalle", 25/08/2026) — donut de
 * activos/offline (gestionados) + leyenda con descubiertos sin aprobar aparte
 * (no integran el total gestionado). Reemplaza el cálculo client-side por umbral
 * que tenía antes: activos/offline ya vienen resueltos por el mismo `AgentStats`
 * que alimenta la tira de métricas, para que nunca se desincronicen. */
export default function DeviceSummaryCard({ stats, loading, error, onRetry }: {
  stats: AgentStats | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  const total = stats?.devices_total ?? 0;
  const active = stats?.devices_active ?? 0;
  const offline = stats?.devices_offline ?? 0;
  const pending = stats?.discovered_pending ?? 0;
  const activeLen = total > 0 ? CIRCUMFERENCE * (active / total) : 0;
  const offlineLen = total > 0 ? CIRCUMFERENCE * (offline / total) : 0;
  const offlineRotation = total > 0 ? -90 + (active / total) * 360 : -90;

  return (
    <div className="flex h-full flex-col rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Equipos del sitio</span>
        {!loading && !error && <span className="font-sans text-[11.5px] text-ink-300">{fmt(total)} en total</span>}
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 pb-6 text-center">
          <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
          <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-5 px-5 pb-5 pt-[2px]">
          <svg width={112} height={112} viewBox="0 0 112 112" className="shrink-0">
            <circle cx={56} cy={56} r={R} fill="none" stroke="var(--color-surface-track)" strokeWidth={15} />
            {!loading && total > 0 && (
              <>
                <circle
                  cx={56} cy={56} r={R} fill="none" stroke="var(--color-brand)" strokeWidth={15}
                  strokeDasharray={`${activeLen} ${CIRCUMFERENCE - activeLen}`} transform="rotate(-90 56 56)"
                />
                <circle
                  cx={56} cy={56} r={R} fill="none" stroke="var(--color-brand-severe)" strokeWidth={15}
                  strokeDasharray={`${offlineLen} ${CIRCUMFERENCE - offlineLen}`} transform={`rotate(${offlineRotation} 56 56)`}
                />
              </>
            )}
            <text x={56} y={53} textAnchor="middle" fill="var(--color-ink-900)" className="font-montserrat text-[22px] font-extrabold">{fmt(total)}</text>
            <text x={56} y={70} textAnchor="middle" fill="var(--color-ink-300)" className="font-sans text-[10px]">equipos</text>
          </svg>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between border-b border-line-200 py-2">
              <span className="flex items-center gap-2 font-sans text-[12.5px] text-ink-700"><span className="block h-2 w-2 rounded-full bg-brand" /> Activos</span>
              <span className="font-montserrat text-[13px] font-semibold tabular-nums text-ink-900">{fmt(active)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line-200 py-2">
              <span className="flex items-center gap-2 font-sans text-[12.5px] text-ink-700"><span className="block h-2 w-2 rounded-full bg-brand-severe" /> Offline / no gestionados</span>
              <span className="font-montserrat text-[13px] font-semibold tabular-nums text-ink-900">{fmt(offline)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 font-sans text-[12.5px] text-ink-700"><span className="block h-2 w-2 rounded-full bg-surface-track-alt" /> Descubiertos sin aprobar</span>
              <span className="font-montserrat text-[13px] font-semibold tabular-nums text-ink-900">{fmt(pending)}</span>
            </div>
            <div className="flex items-center justify-between pt-[9px]">
              <span className="font-sans text-[10.5px] tracking-[.04em] text-ink-300">TOTAL GESTIONADO</span>
              <span className="font-montserrat text-[14px] font-bold tabular-nums text-ink-900">{fmt(total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
