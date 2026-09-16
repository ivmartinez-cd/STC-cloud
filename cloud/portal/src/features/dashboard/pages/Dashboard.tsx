import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import KpiStrip from '../components/KpiStrip';
import WorkQueueSection, { type QueueItem } from '../components/WorkQueueSection';
import AlertsByClassSection from '../components/AlertsByClassSection';
import AgentsSection from '../components/AgentsSection';
import BrandsSection from '../components/BrandsSection';
import AccountsSection from '../components/AccountsSection';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import { useAuth } from '../../../store/AuthContext';

/** Rediseño minimalista (handoff "Panel de control", 16/09/2026): mismo
 * contenido y mismo orden de lectura que "V1 Compacta" — ¿qué está roto
 * ahora? (KPI) → ¿cómo se reparten las alertas? → ¿qué colas atiendo hoy? →
 * detalle del parque — pero sin tarjetas: se van los bordes de color, el
 * radio, el donut y los degradados. La jerarquía la resuelven reglas
 * hairline de 1px, etiquetas micro en mayúsculas, cifras en mono tabular
 * (`--font-mono`, JetBrains Mono) y un único acento naranja de marca.
 * Área de contenido únicamente — sidebar/topbar son de `app/layout/` y
 * mantienen su propio handoff (26/08/2026). */

function headerDate(d: Date): string {
  const s = d.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function minutesAgo(from: Date, now: number): number {
  return Math.max(0, Math.round((now - from.getTime()) / 60_000));
}

// Sin `tracking` acá a propósito: cada uso pasa el suyo (.16em el eyebrow,
// .12em el chip y la acción) y dos utilidades `tracking-[…]` en el mismo
// elemento se resolverían por orden de CSS, no por orden en el string.
const LABEL_MICRO = 'font-montserrat text-[10px] font-semibold uppercase leading-none';

function PageHeader({ eyebrow, synced, syncLabel, meta, action }: {
  eyebrow: string; synced: boolean; syncLabel: string; meta: string | null; action: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className={`${LABEL_MICRO} tracking-[.16em] text-ink-400`}>{eyebrow}</div>
        <h1 className="m-0 mt-2 font-montserrat text-[32px] font-semibold leading-[1.1] text-ink-900 short:text-[26px]">Panel de control</h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 font-sans text-[12px] text-ink-400">
          <span className={`${LABEL_MICRO} flex items-center gap-1.5 tracking-[.12em] text-brand-accent`}>
            <span className="block h-[5px] w-[5px] rounded-full" style={{ background: synced ? 'var(--color-brand)' : 'var(--color-brand-severe)' }} />
            {synced ? `Sincronizado ${syncLabel}` : `Sin sincronizar${syncLabel ? ` · ${syncLabel}` : ''}`}
          </span>
          {meta && <span>{meta}</span>}
        </div>
      </div>
      {/* Deliberadamente un enlace subrayado y no un botón sólido: es la
          reducción principal de ruido respecto del rediseño anterior (README
          del handoff). Abre el alta de verdad — `?new=1`, lo lee `Clients.tsx`. */}
      {action && (
        <Link
          to="/clients?new=1"
          className={`${LABEL_MICRO} border-b border-brand pb-1 tracking-[.12em] text-ink-900 transition-colors duration-[120ms] ease-in-out hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2`}
        >
          + Nuevo cliente
        </Link>
      )}
    </header>
  );
}

const Dashboard = () => {
  // Un `client_viewer` no puede entrar a `/agents`, `/pending` ni `/activity`
  // (`RequireRole` lo rebota acá mismo con un toast): los accesos directos a esas
  // pantallas, el alta de clientes y el ranking de cuentas se ocultan en vez de
  // ofrecerle caminos que terminan en "no tenés permisos" (12/09/2026).
  const isClientViewer = useAuth().role === 'client_viewer';
  const { data, loading, error, lastSyncAt, fetchDashboardData } = useDashboard();
  const {
    incidents, incidentsLoading, incidentsError, retryIncidents,
    supplyRequests, supplyRequestsLoading, supplyRequestsError, retrySupplyRequests,
    supplies, suppliesLoading,
  } = useDashboardExtras();

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const d = data?.discovered;
  const inc = incidents?.byStatus ?? {};
  const sr = supplyRequests ?? {};

  // El chip refleja el ÚLTIMO POLL, no la carga inicial: mientras haya datos
  // buenos previos, un poll fallido no le quita el número a ninguna cifra —
  // sólo el chip pasa a "Sin sincronizar" (README, "Interactions & Behavior").
  const synced = !!lastSyncAt && !error;
  const syncLabel = lastSyncAt
    ? (synced
      ? lastSyncAt.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
      : `hace ${minutesAgo(lastSyncAt, Date.now())}m`)
    : '';

  // Estado de error "duro" por bloque: sólo cuando jamás hubo datos buenos —
  // si ya cargó una vez, un poll fallido no tumba las secciones a la vista de
  // error (ver comentario del chip arriba).
  const mainError = error && !data;
  const mainLoading = loading && !data;

  // "Cola de trabajo" consolida 3 fuentes independientes (`/dashboard`,
  // `/incidents/stats`, `/supply-requests/stats`): sólo se ve como
  // "cargando"/"con error" si NINGUNA de las tres trajo nunca un dato bueno —
  // mismo criterio de "última cifra buena" que el resto del panel, aplicado a
  // las tres fuentes juntas.
  const queueLoading = mainLoading && incidentsLoading && !incidents && supplyRequestsLoading && !supplyRequests;
  const queueError = mainError && incidentsError && !incidents && supplyRequestsError && !supplyRequests;
  const retryQueue = () => { fetchDashboardData(); retryIncidents(); retrySupplyRequests(); };

  const queueItems: QueueItem[] = [
    ...(isClientViewer ? [] : [{
      key: 'pending',
      label: 'Dispositivos por registrar',
      meta: `${fmt(d?.today ?? 0)} descubiertos hoy · ${fmt(d?.yesterday ?? 0)} ayer`,
      value: d?.pendingTotal ?? 0,
      severity: (d?.pendingTotal ?? 0) > 0 ? 'warning' as const : 'ok' as const,
      to: '/pending',
    }]),
    {
      key: 'supply',
      label: 'Solicitudes de consumible',
      meta: 'pendientes de procesar',
      value: sr.pending ?? 0,
      severity: (sr.pending ?? 0) > 0 ? 'warning' as const : 'ok' as const,
      to: '/supply-requests',
    },
    ...(isClientViewer ? [] : [{
      key: 'unmanaged',
      label: 'Dispositivos sin alta',
      meta: `de ${fmt(data?.stats?.devices ?? 0)} en inventario`,
      value: data?.stats?.devicesUnmanaged ?? 0,
      severity: (data?.stats?.devicesUnmanaged ?? 0) > 0 ? 'warning' as const : 'ok' as const,
    }]),
    {
      key: 'incidents',
      label: 'Incidencias abiertas',
      meta: inc.in_progress ? `${fmt(inc.in_progress)} en curso` : 'ninguna en curso',
      value: inc.open ?? 0,
      severity: (inc.open ?? 0) > 0 ? 'critical' as const : 'ok' as const,
      to: '/incidents',
    },
  ];

  const meta = data?.stats
    ? `${headerDate(new Date())}${isClientViewer ? '' : ` · ${fmt(data.stats.clients)} clientes`} · ${fmt(data.stats.devices)} dispositivos`
    : null;

  return (
    <div className="-m-4 flex flex-col gap-[34px] bg-surface-page px-[clamp(20px,4vw,48px)] pb-16 pt-[34px] short:gap-6 short:pb-8 short:pt-5 md:-m-10">
      <PageHeader
        // "global" es cierto para quien ve toda la red; a un cliente, que sólo ve
        // sus propios equipos, le prometía algo que no es.
        eyebrow={isClientViewer ? 'Estado de su infraestructura monitoreada' : 'Visión estratégica de la infraestructura global'}
        synced={synced} syncLabel={syncLabel} meta={meta} action={!isClientViewer}
      />

      <KpiStrip
        stats={data?.stats}
        alertsByClass={data?.alertsByClass}
        supplies={supplies}
        suppliesLoading={suppliesLoading}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      <AlertsByClassSection
        alertsByClass={data?.alertsByClass}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      {/* "Movimientos y cambios" se retiró del panel (Iván, 16/09/2026): dos cifras
          de contexto que nadie "atiende", y con el detalle a un clic en el sidebar
          ("Movimientos" → `/activity`) no justificaban media fila. */}
      <WorkQueueSection items={queueItems} loading={queueLoading} error={queueError} onRetry={retryQueue} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-10 short:gap-7">
        <BrandsSection
          brands={data?.brands}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        {/* Ranking de cuentas: es una vista de cartera del proveedor. El backend ya
            devuelve sólo el cliente propio, así que para él sería una lista de uno. */}
        {!isClientViewer && (
          <AccountsSection
            topClients={data?.topClients}
            totalClients={data?.stats?.clients}
            totalDevices={data?.stats?.devices}
            loading={mainLoading}
            error={mainError}
            onRetry={fetchDashboardData}
          />
        )}
        <AgentsSection
          agentVersions={data?.agentVersions}
          currentAgentVersion={data?.currentAgentVersion}
          publishedAgentVersions={data?.publishedAgentVersions}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
      </section>
    </div>
  );
};

export default Dashboard;
