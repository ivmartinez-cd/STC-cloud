import type { AgentActivityEvent, AgentActivityKind } from '../types/monitorDetail';
import { APP_LOCALE } from '../../../shared/lib/formatters';

const KIND_COLOR: Record<AgentActivityKind, string> = {
  barrido: 'bg-brand', incidencia: 'bg-brand-severe', administrativo: 'bg-brand-gray',
};

function formatAge(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 3) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString(APP_LOCALE);
}

/** "Actividad reciente" (handoff hifi "Monitor — detalle", 25/08/2026) — timeline
 * fusionado de 3 fuentes reales en el backend (alertas + auditoría + comandos
 * completados, ver `KnexAgentPortalRepository.getRecentActivity`). Sólo
 * admin/operator (ver `useMonitorActivity`: expone quién hizo qué). */
export default function RecentActivityCard({ events, loading, error, onRetry, onViewConsole, visible = true }: {
  events: AgentActivityEvent[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onViewConsole?: () => void;
  visible?: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Actividad reciente</span>
        {onViewConsole && (
          <button
            type="button" onClick={onViewConsole}
            className="font-montserrat text-[10px] font-semibold uppercase tracking-[.08em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            Ver consola →
          </button>
        )}
      </div>

      <div className="px-5 pb-4 pt-2">
        {error && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
            <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
            <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
          </div>
        )}

        {!error && loading && (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[8px_1fr_84px] items-baseline gap-[11px] border-b border-line-200 py-[9px]">
              <span className="h-1.5 w-1.5 rounded-full bg-surface-track" />
              <span className="h-3 w-4/5 animate-pulse rounded bg-surface-track" />
              <span className="h-3 w-full animate-pulse rounded bg-surface-track" />
            </div>
          ))
        )}

        {!error && !loading && events.length === 0 && (
          <p className="py-8 text-center font-sans text-[12.5px] text-ink-300">Sin actividad en las últimas 72 horas</p>
        )}

        {!error && !loading && events.map((e, i) => (
          <div
            key={e.id}
            className={`grid grid-cols-[8px_1fr_84px] items-baseline gap-[11px] py-[9px] ${i === events.length - 1 ? '' : 'border-b border-line-200'}`}
          >
            <span className={`relative top-1 block h-[7px] w-[7px] rounded-full ${KIND_COLOR[e.kind]}`} />
            <span className="font-sans text-[12.5px] leading-[1.4] text-ink-700">{e.text}</span>
            <span className="text-right font-sans text-[11.5px] leading-[1.4] text-ink-300">{formatAge(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
