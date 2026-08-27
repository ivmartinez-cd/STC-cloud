import type { ConnectivityDay } from '../types/monitorDetail';
import { APP_LOCALE } from '../../../shared/lib/formatters';

const STATUS_HEIGHT: Record<ConnectivityDay['status'], string> = { online: '100%', parcial: '63%', sin_contacto: '33%' };
const STATUS_COLOR: Record<ConnectivityDay['status'], string> = { online: 'bg-brand-gray', parcial: 'bg-brand', sin_contacto: 'bg-brand-severe' };

function formatAxisDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase();
}

function tooltipFor(day: ConnectivityDay): string {
  const fecha = new Date(`${day.date}T00:00:00Z`).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const minutos = day.downtime_minutes > 0 ? `${day.downtime_minutes} min sin contacto` : 'sin cortes';
  const reconexiones = day.reconnects > 0 ? ` · ${day.reconnects} reconexión(es)` : '';
  return `${fecha} · ${minutos}${reconexiones}`;
}

/** "Conectividad · últimos 30 días" (handoff hifi "Monitor — detalle", 25/08/2026) —
 * 30 barras, altura/color por estado del día. APROXIMACIÓN DOCUMENTADA: no existe
 * un log estructurado de conectividad día a día — el backend la deriva agregando,
 * por día calendario, el tiempo cubierto por alertas `agent_offline` (ver docblock
 * de `ConnectivityDay` en `cloud/src/modules/agents/domain/entities/monitor-detail.ts`). */
export default function ConnectivityStrip({ days, loading, error, onRetry, uptimePct, outages }: {
  days: ConnectivityDay[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  uptimePct: number | null;
  outages: number | null;
}) {
  return (
    <div className="rounded-[5px] border border-line-100 bg-white">
      <div className="flex items-baseline justify-between px-5 py-3.5">
        <span className="font-montserrat text-[9px] font-bold uppercase tracking-[.15em] text-ink-600">Conectividad · últimos 30 días</span>
        {uptimePct != null && outages != null && !loading && !error && (
          <span className="font-sans text-[11.5px] text-ink-300">
            {uptimePct.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}% en línea · {outages} corte{outages === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-1.5 px-5 pb-6 pt-2 text-center">
          <span className="font-sans text-[12.5px] text-ink-900">No se pudo cargar</span>
          <button type="button" onClick={onRetry} className="font-montserrat text-[9.5px] font-semibold uppercase tracking-[.1em] text-brand-accent hover:underline">Reintentar</button>
        </div>
      ) : (
        <div className="px-5 pb-4 pt-[18px] short:pb-3 short:pt-3">
          <div className="flex h-[60px] short:h-11 items-end gap-[3px]">
            {loading
              ? Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="h-full flex-1 animate-pulse rounded-[2px] bg-surface-track" style={{ height: 20 + (i % 3) * 15 }} />
              ))
              : days.map((d) => (
                <div
                  key={d.date}
                  role="img"
                  aria-label={tooltipFor(d)}
                  title={tooltipFor(d)}
                  className={`flex-1 rounded-[2px] ${STATUS_COLOR[d.status]}`}
                  style={{ height: STATUS_HEIGHT[d.status] }}
                />
              ))}
          </div>

          {!loading && days.length > 0 && (
            <div className="mt-[9px] flex items-center justify-between">
              <span className="font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-[#a5aaad]">{formatAxisDate(days[0].date)}</span>
              <span className="font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-[#a5aaad]">{formatAxisDate(days[Math.floor(days.length / 2)].date)}</span>
              <span className="font-montserrat text-[9px] font-semibold uppercase tracking-[.08em] text-[#a5aaad]">{formatAxisDate(days[days.length - 1].date)}</span>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap gap-5 border-t border-surface-track pt-[13px]">
            <span className="flex items-center gap-2 font-sans text-[11.5px] text-ink-100"><span className="block h-[3px] w-[9px] bg-brand-gray" /> En línea todo el día</span>
            <span className="flex items-center gap-2 font-sans text-[11.5px] text-ink-100"><span className="block h-[3px] w-[9px] bg-brand" /> Corte parcial</span>
            <span className="flex items-center gap-2 font-sans text-[11.5px] text-ink-100"><span className="block h-[3px] w-[9px] bg-brand-severe" /> Sin contacto</span>
          </div>
        </div>
      )}
    </div>
  );
}
