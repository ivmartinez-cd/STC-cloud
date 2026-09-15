import type { ReactNode } from 'react';
import type { DashboardData } from '../../../shared/types/monitor';
import type { SuppliesSummaryResponse } from '../../../shared/types/supplies';
import { fmt, pctOf, APP_LOCALE } from '../../../shared/lib/formatters';
import CardError from '../../../shared/components/CardError';
import SkeletonBlock from './Skeleton';

type Stats = DashboardData['stats'];
type AlertsByClass = DashboardData['alertsByClass'];

interface HeadlineProps {
  stats: Stats | undefined;
  alertsByClass: AlertsByClass | undefined;
  supplies: SuppliesSummaryResponse | null | undefined;
  suppliesLoading?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function Shell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[5px] border border-line-100 border-t-[3px] bg-white px-[18px] pb-4 pt-3.5 short:pb-3 short:pt-3" style={{ borderTopColor: accent }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.16em] text-ink-300">{children}</span>;
}

function Value({ value, legend, color }: { value: string; legend: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-montserrat text-[30px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900" style={color ? { color } : undefined}>{value}</span>
      <span className="font-sans text-[11.5px] text-ink-400">{legend}</span>
    </div>
  );
}

function LoadingRow() {
  return <SkeletonBlock heightPx={30} widthPct={45} />;
}

/** ALERTAS ACTIVAS: total de alertas abiertas + la clase que más pesa, en el
 * mismo espíritu del rediseño "V1 Compacta" (handoff 14/09/2026) — una sola
 * línea de lectura en vez de repetir el mismo dato en header y valor. */
function AlertsCard({ alertsByClass, loading, error, onRetry }: Pick<HeadlineProps, 'alertsByClass' | 'loading' | 'error' | 'onRetry'>) {
  const rows = alertsByClass ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const top1 = rows[0];
  const pct1 = top1 ? pctOf(top1.count, total) : 0;

  return (
    <Shell accent="var(--color-brand)">
      <Label>Alertas activas</Label>
      {error ? (
        <CardError onRetry={onRetry} className="py-4" />
      ) : loading ? (
        <LoadingRow />
      ) : (
        <Value
          value={fmt(total)}
          legend={top1 ? `${pct1.toLocaleString(APP_LOCALE)}% ${top1.label.toLowerCase()}` : 'sin alertas activas'}
          color="var(--color-severity-critical)"
        />
      )}
    </Shell>
  );
}

/** CONSUMIBLES EN ALERTA: críticos + bajos de `/supplies/summary` — mismo
 * dato que ya mostraba `StatsStrip`, ahora como titular (handoff "V1
 * Compacta" lo sube de rango: gerencia lo quiere ver sin scrollear). */
function SuppliesCard({ supplies, suppliesLoading, error, onRetry }: { supplies: SuppliesSummaryResponse | null | undefined; suppliesLoading?: boolean; error?: boolean; onRetry?: () => void }) {
  const total = supplies ? supplies.criticalCount + supplies.lowCount : 0;

  return (
    <Shell accent="var(--color-brand-severe)">
      <Label>Consumibles en alerta</Label>
      {error ? (
        <CardError onRetry={onRetry} className="py-4" />
      ) : suppliesLoading && !supplies ? (
        <LoadingRow />
      ) : (
        <Value
          value={fmt(total)}
          legend={supplies ? `${fmt(supplies.criticalCount)} críticos` : 'sin datos'}
          color="var(--color-brand-severe)"
        />
      )}
    </Shell>
  );
}

/** PARQUE GESTIONADO: dispositivos gestionados / inventario total, con
 * medidor semicircular (mismo dato que la celda "Gestionados" de
 * `StatsStrip`, que este rediseño reemplaza). */
function ManagedFleetGauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width="56" height="36" viewBox="0 0 62 40" aria-hidden="true" className="shrink-0">
      <path d="M6 34 A 25 25 0 0 1 56 34" fill="none" stroke="var(--color-surface-track)" strokeWidth="6" strokeLinecap="round" pathLength={100} />
      <path d="M6 34 A 25 25 0 0 1 56 34" fill="none" stroke="var(--color-severity-ok)" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray={`${clamped} ${100 - clamped}`} />
      <text x="31" y="32" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="10" fontWeight={700} fill="var(--color-ink-600)">{Math.round(clamped)}%</text>
    </svg>
  );
}

function ManagedFleetCard({ stats, loading, error, onRetry }: Pick<HeadlineProps, 'stats' | 'loading' | 'error' | 'onRetry'>) {
  const devices = stats?.devices ?? 0;
  const unmanaged = stats?.devicesUnmanaged ?? 0;
  const managed = Math.max(0, devices - unmanaged);
  const pct = pctOf(managed, devices);

  return (
    <Shell accent="var(--color-severity-ok)">
      <Label>Parque gestionado</Label>
      {error ? (
        <CardError onRetry={onRetry} className="py-4" />
      ) : loading ? (
        <LoadingRow />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-montserrat text-[24px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900">{fmt(managed)}</span>
            <span className="font-sans text-[11.5px] text-ink-400">de {fmt(devices)}</span>
          </div>
          <ManagedFleetGauge pct={pct} />
        </div>
      )}
    </Shell>
  );
}

/** MONITORES EN LÍNEA: presencia del parque de monitores, en positivo (antes
 * "Monitores sin conexión") — el mismo dato que `MonitorPresenceCard`, que
 * este rediseño retira como tarjeta aparte: con sólo 1-2 monitores por
 * cliente típico, un donut dedicado sobraba. */
function MonitorsOnlineCard({ stats, loading, error, onRetry }: Pick<HeadlineProps, 'stats' | 'loading' | 'error' | 'onRetry'>) {
  const total = stats?.agents.total ?? 0;
  const online = stats?.agents.online ?? 0;
  const offline = Math.max(0, total - online);
  const allOnline = total > 0 && offline === 0;

  return (
    <Shell accent={offline > 0 ? 'var(--color-severity-critical)' : 'var(--color-severity-ok)'}>
      <Label>Monitores en línea</Label>
      {error ? (
        <CardError onRetry={onRetry} className="py-4" />
      ) : loading ? (
        <LoadingRow />
      ) : (
        <Value
          value={`${fmt(online)}/${fmt(total)}`}
          legend={allOnline ? 'sin caídas' : total > 0 ? `${fmt(offline)} sin conexión` : 'sin monitores'}
          color={offline > 0 ? 'var(--color-severity-critical)' : 'var(--color-severity-ok)'}
        />
      )}
    </Shell>
  );
}

/** Tira de 4 titulares del rediseño "V1 Compacta" (handoff 14/09/2026,
 * `Panel de control · 3 opciones.html`): alertas activas, consumibles en
 * alerta, parque gestionado y monitores en línea — reemplaza las 3 tarjetas
 * anteriores (alertas / monitores sin conexión / volumen mensual) y absorbe
 * "Gestionados" de `StatsStrip`, que este rediseño retira. */
export default function HeadlineCards({ stats, alertsByClass, supplies, suppliesLoading, loading, error, onRetry }: HeadlineProps) {
  return (
    <div className="mb-4 short:mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <AlertsCard alertsByClass={alertsByClass} loading={loading} error={error} onRetry={onRetry} />
      <SuppliesCard supplies={supplies} suppliesLoading={suppliesLoading} error={error} onRetry={onRetry} />
      <ManagedFleetCard stats={stats} loading={loading} error={error} onRetry={onRetry} />
      <MonitorsOnlineCard stats={stats} loading={loading} error={error} onRetry={onRetry} />
    </div>
  );
}
