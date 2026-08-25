import type { DashboardData } from '../../../shared/types/monitor';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';
import { fmt, fmtPct, pctOf } from '../../../shared/lib/formatters';
import MiniBar from './MiniBar';
import CardError from './CardError';
import SkeletonBlock from './Skeleton';

interface Cell {
  label: string;
  value?: number;
  note?: string;
  bar?: number;
  accent?: boolean;
}

function buildCells(s: DashboardData['stats'] | undefined, supplies: SuppliesSummaryResponse | null | undefined): Cell[] {
  const agents = s?.agents.total ?? 0;
  const online = s?.agents.online ?? 0;
  const reporting = s?.agents.reporting ?? 0;
  const devices = s?.devices ?? 0;
  const unmanaged = s?.devicesUnmanaged ?? 0;
  const devReporting = s?.devicesReporting ?? 0;
  const managed = Math.max(0, devices - unmanaged);
  const hasSupplies = supplies != null;

  return [
    { label: 'Clientes', value: s?.clients ?? 0, note: 'activos' },
    { label: 'Monitores', value: agents, note: 'instalados' },
    { label: 'En línea', value: online, note: fmtPct(online, agents) },
    { label: 'Mon. reportando', value: reporting, bar: pctOf(reporting, agents) },
    { label: 'Dispositivos', value: devices, note: 'en inventario' },
    { label: 'Disp. reportando', value: devReporting, bar: pctOf(devReporting, devices) },
    { label: 'Gestionados', value: managed, note: fmtPct(managed, devices) },
    { label: 'No gestionados', value: unmanaged, note: 'requiere alta', accent: unmanaged > 0 },
    {
      label: 'Consumibles alerta',
      value: hasSupplies ? supplies.criticalCount + supplies.lowCount : undefined,
      note: hasSupplies ? `${fmt(supplies.criticalCount)} críticos · ${fmt(supplies.lowCount)} bajos` : undefined,
    },
  ];
}

/** Tira de 9 KPIs del Panel de Control hifi: una sola grilla con 1px de gap
 * (las líneas divisorias son el gap sobre `#E5E8E8`), sin cabecera propia —
 * va inmediatamente debajo de las tres tarjetas de titular. */
export default function StatsStrip({
  stats, loading, error, onRetry, supplies, suppliesLoading,
}: {
  stats: DashboardData['stats'] | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  supplies?: SuppliesSummaryResponse | null;
  suppliesLoading?: boolean;
}) {
  const cells = buildCells(stats, supplies);

  return (
    <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-[5px] border border-line-100 bg-line-400 md:grid-cols-5 xl:grid-cols-9">
      {error ? (
        <div className="col-span-3 bg-white px-4 py-6 md:col-span-5 xl:col-span-9">
          <CardError onRetry={onRetry} className="py-2" />
        </div>
      ) : (
        cells.map((c) => {
          const cellLoading = loading || (c.label === 'Consumibles alerta' && suppliesLoading);
          return (
            <div key={c.label} className="bg-white px-4 pb-4 pt-[15px]">
              <div className="font-montserrat text-[8px] font-bold uppercase leading-[1.3] tracking-[.13em] text-ink-300">{c.label}</div>
              {cellLoading ? (
                <SkeletonBlock heightPx={21} widthPct={60} className="mt-1.5" />
              ) : (
                <div className={`font-montserrat text-[21px] font-bold leading-[1.35] tabular-nums ${c.accent ? 'text-brand-severe' : 'text-ink-900'}`}>
                  {c.value != null ? fmt(c.value) : '—'}
                </div>
              )}
              {c.bar != null ? (
                <MiniBar pct={cellLoading ? 0 : c.bar} height={4} radius={2} className="mt-[7px]" />
              ) : (
                <div className="font-sans text-[11px] leading-[1.3] text-ink-300">{cellLoading ? ' ' : (c.note ?? '')}</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
