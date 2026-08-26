import { fmt, fmtPct, pctOf, APP_LOCALE } from '../../../shared/lib/formatters';
import type { ClientPortfolioSummary } from '../types/clientsDirectory';

/** Tira de 5 métricas de cartera (handoff hifi "Clientes", 25/08/2026) — endpoint
 * aparte del listado paginado (`GET /clients/summary`), falla independiente de la
 * tabla. `auto-fit` la reflow responsive 5 → 3 → 2 → 1 (README). */
export default function PortfolioMetricsStrip({
  summary, loading, error, onRetry,
}: {
  summary: ClientPortfolioSummary | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="mb-4 flex flex-col items-center justify-center gap-1.5 rounded-[5px] border border-line-100 bg-white px-4 py-6 text-center">
        <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const withContactPct = summary ? pctOf(summary.with_contact, summary.clients_total) : 0;

  const cells: Array<{ label: string; value: string; note?: string; bar?: number; accent?: boolean }> = [
    { label: 'Clientes activos', value: fmt(summary?.clients_total ?? 0), note: 'en la red de monitoreo' },
    { label: 'Con contacto asignado', value: fmt(summary?.with_contact ?? 0), bar: withContactPct },
    {
      label: 'Sin contacto', value: fmt(summary?.without_contact ?? 0), accent: true,
      note: summary ? `${fmtPct(summary.without_contact, summary.clients_total)} de la cartera` : undefined,
    },
    {
      label: 'Con alertas abiertas', value: fmt(summary?.with_open_alerts ?? 0),
      note: summary ? `${fmt(summary.open_alerts_total)} alertas en total` : undefined,
    },
    {
      label: 'Concentración top 5',
      value: summary ? `${summary.top5_device_share_pct.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}%` : '—',
      note: summary ? `${fmt(summary.top5_device_count)} de ${fmt(summary.devices_total)} equipos` : undefined,
    },
  ];

  // `auto-fit`/`minmax` a secas (como pide el README al pie de la letra) le mete un
  // piso de 190px por columna al *min-content* de la grilla — sin nada en la cadena de
  // ancestros de `Layout.tsx` que le ponga `min-width:0` al item flex de `main` (fuera
  // de alcance: "no tocar layout/"), ese piso se propaga hacia arriba y fuerza scroll
  // horizontal de TODA la página en vez de reflowear. Breakpoints explícitos (mismo
  // criterio que `StatsStrip.tsx` del Panel de Control) logran el mismo 5→3→2→1 sin ese
  // piso de ancho — ninguna combinación de columnas fuerza un mínimo mayor al viewport.
  return (
    <div className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-[18px] pb-4 pt-[15px]">
          <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{c.label}</div>
          {loading ? (
            <span className="mt-1.5 block h-[21px] w-3/5 animate-pulse rounded bg-surface-track" />
          ) : (
            <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${c.accent ? 'text-brand-severe' : 'text-ink-900'}`}>
              {c.value}
            </div>
          )}
          {c.bar != null ? (
            <span className="mt-[7px] block h-1 w-full overflow-hidden rounded-[2px] bg-surface-track">
              <span className="block h-full rounded-[2px] bg-brand" style={{ width: `${loading ? 0 : Math.max(c.bar, c.bar > 0 ? 2 : 0)}%` }} />
            </span>
          ) : (
            <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{loading ? ' ' : (c.note ?? '')}</div>
          )}
        </div>
      ))}
    </div>
  );
}
