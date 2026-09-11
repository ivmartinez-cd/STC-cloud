import { fmt } from '../../../../shared/lib/formatters';
import type { DeviceStats } from '../../types/deviceDetailPage';

interface Cell { label: string; value: string; note?: string; accent?: boolean; }

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

/** Tira de 6 métricas del header (handoff hifi "Dispositivo — detalle",
 * 25/08/2026) — molde de tira del handoff: divisorias por `border-left`, nunca
 * `gap` sobre fondo gris. */
export default function DeviceMetricsStrip({ stats, loading, error, onRetry }: {
  stats: DeviceStats | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 border-t border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">
          Reintentar
        </button>
      </div>
    );
  }

  const cells: Cell[] = [
    { label: 'Contador total', value: fmt(stats?.total_counter ?? 0), note: 'páginas acumuladas' },
    { label: 'Volumen del mes', value: fmt(stats?.volume_month ?? 0), note: stats?.volume_month_site_pct != null ? `${stats.volume_month_site_pct}% del sitio` : undefined },
    { label: 'Monocromo', value: fmt(stats?.mono_pages ?? 0), note: stats?.mono_pct != null ? `${stats.mono_pct}% del total` : undefined },
    { label: 'Color', value: fmt(stats?.color_pages ?? 0), note: stats?.color_pct != null ? `${stats.color_pct}% del total` : undefined },
    stats?.lowest_supply
      ? { label: 'Consumible más bajo', value: `${stats.lowest_supply.pct}%`, accent: stats.lowest_supply.pct <= 35, note: [stats.lowest_supply.label.toLowerCase(), stats.lowest_supply.remaining_pages != null ? `${fmt(stats.lowest_supply.remaining_pages)} pág.` : null].filter(Boolean).join(' · ') }
      : { label: 'Consumible más bajo', value: '—', note: 'sin datos' },
    { label: 'Atascos 30 d', value: fmt(stats?.jams.count_30d ?? 0), note: stats?.jams.tray_label ?? (stats?.jams.count_30d ? undefined : 'sin incidentes') },
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
