import type { ReactNode } from 'react';
import type { DashboardData } from '../../../shared/types/monitor';
import { fmt, pctOf, APP_LOCALE } from '../../../shared/lib/formatters';
import CardError from '../../../shared/components/CardError';
import MiniBar from './MiniBar';
import SkeletonBlock from './Skeleton';

type Stats = DashboardData['stats'];
type AlertsByClass = DashboardData['alertsByClass'];

interface HeadlineProps {
  stats: Stats | undefined;
  alertsByClass: AlertsByClass | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function Shell({
  accent, children,
}: { accent: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[5px] border border-line-100 border-t-[3px] bg-white px-[22px] pb-[22px] pt-5 short:pb-4 short:pt-3.5" style={{ borderTopColor: accent }}>
      {children}
    </div>
  );
}

function Header({ label, delta }: { label: string; delta?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-montserrat text-[8.5px] font-bold uppercase tracking-[.16em] text-ink-300">{label}</span>
      {delta && <span className="font-sans text-[11px] text-brand-accent">{delta}</span>}
    </div>
  );
}

function Value({ value, legend }: { value: string; legend: string }) {
  return (
    <div className="mt-3 flex items-baseline gap-2.5">
      <span className="font-montserrat text-[38px] font-extrabold leading-none tracking-[-.02em] tabular-nums text-ink-900">{value}</span>
      <span className="font-sans text-[12.5px] text-ink-400">{legend}</span>
    </div>
  );
}

/** ALERTAS ACTIVAS: total de alertas abiertas + barra apilada de 3 segmentos
 * (la clase principal / la segunda / el resto), en el mismo espíritu del
 * ejemplo del handoff (81% disponibilidad / 11% cambio del sistema / 8%
 * resto) pero calculado en forma genérica sobre `alertsByClass` real. */
function AlertsCard({ alertsByClass, loading, error, onRetry }: Pick<HeadlineProps, 'alertsByClass' | 'loading' | 'error' | 'onRetry'>) {
  const rows = alertsByClass ?? [];
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const top1 = rows[0];
  const top2 = rows[1];
  const pct1 = top1 ? pctOf(top1.count, total) : 0;
  const pct2 = top2 ? pctOf(top2.count, total) : 0;
  const pctRest = Math.max(0, 100 - pct1 - pct2);

  return (
    <Shell accent="var(--color-brand)">
      <Header label="Alertas activas" delta={!loading && !error && top1 ? `${pct1.toLocaleString(APP_LOCALE)}% ${top1.label.toLowerCase()}` : undefined} />
      {error ? (
        <CardError onRetry={onRetry} className="py-6" />
      ) : loading ? (
        <>
          <SkeletonBlock heightPx={38} widthPct={45} className="mt-3" />
          <MiniBar pct={0} height={6} radius={3} className="mt-[14px]" />
        </>
      ) : (
        <>
          <Value value={fmt(total)} legend={top1 ? `${fmt(top1.count)} de ${top1.label.toLowerCase()}` : 'sin alertas activas'} />
          <div className="mt-[14px] flex h-1.5 overflow-hidden rounded-[3px]">
            <div style={{ width: `${pct1}%`, background: 'var(--color-brand)' }} />
            <div style={{ width: `${pct2}%`, background: 'var(--color-brand-light)' }} />
            <div style={{ width: `${pctRest}%`, background: 'var(--color-surface-track-alt)' }} />
          </div>
        </>
      )}
    </Shell>
  );
}

/** MONITORES SIN CONEXIÓN: total de monitores instalados que no están en
 * línea ahora mismo, sobre el total del parque de monitores. */
function OfflineMonitorsCard({ stats, loading, error, onRetry }: Pick<HeadlineProps, 'stats' | 'loading' | 'error' | 'onRetry'>) {
  const total = stats?.agents.total ?? 0;
  const online = stats?.agents.online ?? 0;
  const offline = Math.max(0, total - online);
  const pctOffline = pctOf(offline, total);
  // Sin monitores instalados no hay "% online" que mostrar — un total 100%
  // ahí sería un dato inventado, no una lectura real del parque.
  const pctOnline = total > 0 ? Math.max(0, 100 - pctOffline) : 0;

  return (
    <Shell accent="var(--color-severity-critical)">
      <Header label="Monitores sin conexión" delta={!loading && !error ? `${pctOffline.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}% del parque` : undefined} />
      {error ? (
        <CardError onRetry={onRetry} className="py-6" />
      ) : loading ? (
        <>
          <SkeletonBlock heightPx={38} widthPct={35} className="mt-3" />
          <MiniBar pct={0} height={6} radius={3} className="mt-[14px]" />
        </>
      ) : (
        <>
          <Value value={fmt(offline)} legend={`de ${fmt(total)} instalados · ${fmt(online)} en línea`} />
          {/* Mismo semáforo sutil que MonitorPresenceCard: sin conexión =
              tono más severo, en línea = tono más calmo de la escala. */}
          <div className="mt-[14px] flex h-1.5 overflow-hidden rounded-[3px]">
            <div style={{ width: `${pctOffline}%`, background: 'var(--color-severity-critical)' }} />
            <div style={{ width: `${pctOnline}%`, background: 'var(--color-severity-ok)' }} />
          </div>
        </>
      )}
    </Shell>
  );
}

/** Sparkline de 12 meses en un `viewBox` fijo — sólo se dibuja cuando el
 * backend manda una serie real (`stats.volumeTrend`); nunca se inventa. */
function VolumeSparkline({ trend }: { trend: number[] }) {
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const span = max - min || 1;
  const stepX = 420 / (trend.length - 1);
  const points = trend
    .map((v, i) => `${(i * stepX).toFixed(1)},${(24 - ((v - min) / span) * 22).toFixed(1)}`)
    .join(' ');
  return (
    <svg width="420" height="26" viewBox="0 0 420 26" className="mt-3 block w-full">
      <polyline points={points} fill="none" stroke="var(--color-brand-gray)" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** VOLUMEN MENSUAL: páginas impresas del mes en curso. La variación vs. el
 * mes anterior y el histórico de 12 meses todavía no salen de `/dashboard`
 * (backend fuera de alcance de este rediseño) — se muestran sólo si vienen
 * en la respuesta, sin fabricar un delta ni una curva. */
function VolumeCard({ stats, loading, error, onRetry }: Pick<HeadlineProps, 'stats' | 'loading' | 'error' | 'onRetry'>) {
  const volume = stats?.volume ?? 0;
  const deltaPct = stats?.volumeDeltaPct;
  const trend = stats?.volumeTrend;

  return (
    <Shell accent="var(--color-brand-gray)">
      <Header label="Volumen mensual" delta={!loading && !error && deltaPct != null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toLocaleString(APP_LOCALE, { maximumFractionDigits: 1 })}% vs mes anterior` : undefined} />
      {error ? (
        <CardError onRetry={onRetry} className="py-6" />
      ) : loading ? (
        <>
          <SkeletonBlock heightPx={38} widthPct={55} className="mt-3" />
          <SkeletonBlock heightPx={26} className="mt-3" />
        </>
      ) : (
        <>
          <Value value={fmt(volume)} legend="páginas" />
          {trend && trend.length >= 2 ? (
            <VolumeSparkline trend={trend} />
          ) : (
            <p className="mt-3 font-sans text-[11px] text-ink-300">Sin histórico mensual disponible</p>
          )}
        </>
      )}
    </Shell>
  );
}

/** Las tres tarjetas de titular ("¿qué está roto ahora?") del handoff hifi:
 * alertas activas, monitores sin conexión y volumen mensual. */
export default function HeadlineCards({ stats, alertsByClass, loading, error, onRetry }: HeadlineProps) {
  return (
    <div className="mb-4 short:mb-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AlertsCard alertsByClass={alertsByClass} loading={loading} error={error} onRetry={onRetry} />
      <OfflineMonitorsCard stats={stats} loading={loading} error={error} onRetry={onRetry} />
      <VolumeCard stats={stats} loading={loading} error={error} onRetry={onRetry} />
    </div>
  );
}
