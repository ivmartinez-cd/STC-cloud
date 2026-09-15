import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import HeadlineCards from '../components/HeadlineCards';
import CounterPanel from '../components/CounterPanel';
import WorkQueueCard, { type QueueItem } from '../components/WorkQueueCard';
import AlertsByClassCard from '../components/AlertsByClassCard';
import AgentVersionsCard from '../components/AgentVersionsCard';
import BrandDistributionCard from '../components/BrandDistributionCard';
import TopClientsCard from '../components/TopClientsCard';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import { useAuth } from '../../../store/AuthContext';
/** Rediseño "V1 Compacta" (handoff 14/09/2026, `Panel de control · 3
 * opciones.html`, elegida por Iván sobre "V2 Ejecutiva"/"V3 Operativa"):
 * mismo espíritu de tres preguntas en orden — ¿qué está roto ahora?
 * (titulares) → ¿alertas por clase, cómo se reparten? → ¿qué colas tengo
 * que atender hoy? (movimientos + cola + detalle operativo) — pero en un
 * solo scroll, con menos desglose por bloque que el handoff hifi anterior a
 * propósito (ver docblocks de cada tarjeta). Área de contenido únicamente —
 * sidebar/topbar son de `app/layout/` y no se tocan acá. */

function headerDate(d: Date): string {
  const s = d.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function minutesAgo(from: Date, now: number): number {
  return Math.max(0, Math.round((now - from.getTime()) / 60_000));
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
  // buenos previos, un poll fallido no le quita el número a ninguna tarjeta —
  // sólo el chip pasa a "SIN SINCRONIZAR" (README, "Interactions & Behavior").
  const synced = !!lastSyncAt && !error;
  const syncLabel = lastSyncAt
    ? (synced
      ? lastSyncAt.toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
      : `hace ${minutesAgo(lastSyncAt, Date.now())}m`)
    : '';

  // Estado de error "duro" por bloque: sólo cuando jamás hubo datos buenos —
  // si ya cargó una vez, un poll fallido no tumba las tarjetas a la vista de
  // error (ver comentario del chip arriba).
  const mainError = error && !data;
  const mainLoading = loading && !data;

  // "Cola de trabajo" consolida 3 fuentes independientes (`/dashboard`,
  // `/incidents/stats`, `/supply-requests/stats`) en una sola tarjeta: sólo
  // se ve como "cargando"/"con error" si NINGUNA de las tres trajo nunca un
  // dato bueno — mismo criterio de "última cifra buena" que el resto del
  // panel, aplicado a las tres fuentes juntas.
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

  return (
    <div className="-m-4 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] short:pb-4 short:pt-4 md:-m-10">
      <div className="mb-6 flex flex-wrap items-end short:mb-3 justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3 short:mb-1.5">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              {/* "global" es cierto para quien ve toda la red; a un cliente, que sólo ve
                  sus propios equipos, le prometía algo que no es. */}
              {isClientViewer ? 'Estado de su infraestructura monitoreada' : 'Visión estratégica de la infraestructura global'}
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold short:text-[26px] leading-[1.05] tracking-[-.018em] text-ink-900">
            Panel de control
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-[7px] rounded-[2px] bg-brand-soft px-2.5 py-1 font-montserrat text-[9.5px] font-semibold uppercase leading-none tracking-[.1em] text-brand-accent">
              <span className="block h-1.5 w-1.5 rounded-full" style={{ background: synced ? 'var(--color-brand)' : 'var(--color-brand-severe)' }} />
              {synced ? `SINCRONIZADO ${syncLabel}` : `SIN SINCRONIZAR${syncLabel ? ` · ${syncLabel}` : ''}`}
            </span>
            {data?.stats && (
              <span className="font-sans text-[12.5px] text-ink-400">
                {headerDate(new Date())}
                {!isClientViewer && ` · ${fmt(data.stats.clients)} clientes`}
                {` · ${fmt(data.stats.devices)} dispositivos`}
              </span>
            )}
          </div>
        </div>
        {!isClientViewer && (
          <div className="flex gap-2.5">
            {/* Abre el alta de verdad (`?new=1`, lo lee `Clients.tsx`): antes sólo
                navegaba al listado. "Gestionar agentes" se fue: era el mismo
                destino que "Salud de nodos" del sidebar (auditoría, 14/09/2026). */}
            <Link
              to="/clients?new=1"
              className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            >
              + NUEVO CLIENTE
            </Link>
          </div>
        )}
      </div>

      <HeadlineCards
        stats={data?.stats}
        alertsByClass={data?.alertsByClass}
        supplies={supplies}
        suppliesLoading={suppliesLoading}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      <AlertsByClassCard
        alertsByClass={data?.alertsByClass}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      {/* Movimientos queda aparte de la cola (mismo criterio que "V1 Compacta"): es
          una cifra de contexto, no algo que "atender" como las otras cuatro. Sin
          columna propia para un `client_viewer`, la cola pasa a ocupar todo el ancho. */}
      <div className={`mb-4 short:mb-3 grid grid-cols-1 gap-4 ${isClientViewer ? '' : 'lg:grid-cols-[1.25fr_1fr]'}`}>
        {!isClientViewer && (
          <CounterPanel
            title="Movimientos y cambios"
            to="/activity"
            loading={mainLoading}
            error={mainError}
            onRetry={fetchDashboardData}
            cells={[
              { label: 'Hoy y ayer', value: data?.movements?.recent ?? 0 },
              { label: 'Acumulado', value: data?.movements?.total ?? 0 },
            ]}
          />
        )}
        <WorkQueueCard items={queueItems} loading={queueLoading} error={queueError} onRetry={retryQueue} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <BrandDistributionCard
          brands={data?.brands}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        {/* Ranking de cuentas: es una vista de cartera del proveedor. El backend ya
            devuelve sólo el cliente propio, así que para él sería una lista de uno. */}
        {!isClientViewer && (
          <TopClientsCard
            topClients={data?.topClients}
            totalClients={data?.stats?.clients}
            totalDevices={data?.stats?.devices}
            loading={mainLoading}
            error={mainError}
            onRetry={fetchDashboardData}
          />
        )}
        <AgentVersionsCard
          agentVersions={data?.agentVersions}
          currentAgentVersion={data?.currentAgentVersion}
          publishedAgentVersions={data?.publishedAgentVersions}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
      </div>
    </div>
  );
};

export default Dashboard;
