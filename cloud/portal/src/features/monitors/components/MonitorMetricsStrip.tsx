import { fmt, fmtPct } from '../../../shared/lib/formatters';
import type { AgentStats } from '../types/monitorDetail';

interface Cell { label: string; value: string; note?: string; accent?: boolean; }

function formatDowntime(minutes: number): string {
  if (minutes <= 0) return 'sin cortes';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${m} m`;
}

function formatSweepTime(iso: string | null): string {
  if (!iso) return 'sin barridos aún';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function Metric({ cell, first }: { cell: Cell; first: boolean }) {
  return (
    <div className={`bg-white ${first ? 'px-6' : 'border-l border-line-400 px-5'} pb-4 pt-3.5`}>
      <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{cell.label}</div>
      <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${cell.accent ? 'text-brand-severe' : 'text-ink-900'}`}>
        {cell.value}
      </div>
      <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{cell.note}</div>
    </div>
  );
}

/** Tira de 6 métricas del sitio (handoff hifi "Monitor — detalle", 25/08/2026) —
 * `auto-fit` la reflow 6→4→3→2→1 (README), divisorias por `border-left` (nunca
 * `gap` sobre fondo gris — con recuentos que no dividen 6 quedan huecos). */
export default function MonitorMetricsStrip({ stats, loading, error, onRetry }: {
  stats: AgentStats | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 border-t border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button
          type="button" onClick={onRetry}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const offlinePct = stats ? fmtPct(stats.devices_offline, stats.devices_total) : '0%';

  const cells: Cell[] = [
    { label: 'Equipos monitoreados', value: fmt(stats?.devices_total ?? 0), note: `${fmt(stats?.devices_active ?? 0)} activos` },
    { label: 'Offline / no gestionados', value: fmt(stats?.devices_offline ?? 0), accent: (stats?.devices_offline ?? 0) > 0, note: `${offlinePct} del sitio` },
    {
      label: 'Alertas abiertas', value: fmt(stats?.alerts_open ?? 0), accent: (stats?.alerts_open ?? 0) > 0,
      note: `${fmt(stats?.alerts_availability ?? 0)} de disponibilidad`,
    },
    { label: 'Volumen del mes', value: fmt(stats?.volume_month ?? 0), note: 'páginas del sitio' },
    {
      label: 'Disponibilidad 30 d',
      value: stats ? `${stats.uptime_30d_pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : '—',
      note: stats ? `${fmt(stats.outages_30d)} cortes · ${formatDowntime(stats.downtime_30d_minutes)}` : undefined,
    },
    {
      label: 'Descubiertos sin aprobar', value: fmt(stats?.discovered_pending ?? 0), accent: (stats?.discovered_pending ?? 0) > 0,
      note: `último barrido ${formatSweepTime(stats?.last_sweep_at ?? null)}`,
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-0 border-t border-line-100">
      {cells.map((c, i) => (
        loading
          ? (
            <div key={c.label} className={`bg-white ${i === 0 ? 'px-6' : 'border-l border-line-400 px-5'} pb-4 pt-3.5`}>
              <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{c.label}</div>
              <span className="mt-1.5 block h-[21px] w-3/5 animate-pulse rounded bg-surface-track" />
            </div>
          )
          : <Metric key={c.label} cell={c} first={i === 0} />
      ))}
    </div>
  );
}
