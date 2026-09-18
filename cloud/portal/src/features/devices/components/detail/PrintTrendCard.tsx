import { fmt } from '../../../../shared/lib/formatters';
import { Card, CardTitle } from './primitives';
import CardError from '../../../../shared/components/CardError';
import type { PrintTrend } from '../../types/deviceDetailPage';

const MONTH_SHORT_ES: Record<string, string> = {
  '01': 'ENE', '02': 'FEB', '03': 'MAR', '04': 'ABR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AGO', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DIC',
};

/** "Tendencia de impresión · 12 meses" (handoff hifi "Dispositivo — detalle") —
 * 12 barras apiladas mono/color, ya vienen del backend como deltas mensuales
 * (nunca contadores acumulados — ver `PRINT_TREND_SQL` del lado cloud). */
export default function PrintTrendCard({ isColor, trend, loading, error, onRetry }: {
  isColor: boolean; trend: PrintTrend | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  const months = trend?.months ?? [];
  const max = Math.max(...months.map((m) => m.total), 1);

  return (
    <Card>
      <CardTitle right={isColor &&
        <div className="flex gap-4">
          <span className="flex items-center gap-2 font-sans text-[11.5px] text-ink-400"><span className="block h-[3px] w-[9px] bg-brand-gray" />Monocromo</span>
          <span className="flex items-center gap-2 font-sans text-[11.5px] text-ink-400"><span className="block h-[3px] w-[9px] bg-brand" />Color</span>
        </div>
      }>Tendencia de impresión · 12 meses</CardTitle>
      <div className="px-5 pb-3.5 pt-4">
        {error ? <CardError onRetry={onRetry} /> : (
          <>
            <div className="flex h-[96px] short:h-[74px] items-end gap-1.5">
              {(loading ? Array.from({ length: 12 }) : months).map((m, i) => (
                <div key={loading ? i : (m as typeof months[number]).month} className="flex flex-1 flex-col items-center gap-2">
                  {loading ? <span className="w-full animate-pulse rounded-[2px] bg-surface-track" style={{ height: 40 + (i % 4) * 15 }} /> : (
                    <BarStack month={m as typeof months[number]} max={max} />
                  )}
                  <span className="font-montserrat text-[8.5px] font-semibold tracking-[.06em] text-chart-axis">
                    {loading ? '' : MONTH_SHORT_ES[(m as typeof months[number]).month.slice(-2)]}
                  </span>
                </div>
              ))}
            </div>
            {!loading && trend && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-line-150 pt-3">
                <span className="font-sans text-[12.5px] text-ink-400">
                  Promedio mensual <strong className="font-semibold text-ink-900">{fmt(trend.monthly_avg)} páginas</strong>
                  {trend.peak && <> · pico {fmt(trend.peak.total)} en {MONTH_SHORT_ES[trend.peak.month.slice(-2)]?.toLowerCase()}</>}
                </span>
                {trend.projection_next_month != null && (
                  <span className="font-sans text-[12.5px] text-ink-400">Proyección próximo mes <strong className="font-semibold text-ink-900">{fmt(trend.projection_next_month)} páginas</strong></span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function BarStack({ month, max }: { month: { mono: number; color: number; total: number }; max: number }) {
  // Alturas en % del contenedor (y no en px) para que la tarjeta compacte en
  // viewports bajos (`short:`) sin recortar las barras.
  const pct = Math.max(4, Math.round((month.total / max) * 100));
  const hm = month.total > 0 ? Math.round(pct * (month.mono / month.total)) : 0;
  const hc = pct - hm;
  return (
    <div className="flex h-[86px] short:h-[64px] w-full flex-col justify-end gap-0.5">
      <div className="w-full rounded-t-[2px] bg-brand" style={{ height: `${hc}%`, minHeight: month.color > 0 ? 2 : 0 }} />
      <div className="w-full bg-brand-gray" style={{ height: `${hm}%`, minHeight: month.mono > 0 ? 2 : 0 }} />
    </div>
  );
}
