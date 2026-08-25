import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import HeadlineCards from '../components/HeadlineCards';
import StatsStrip from '../components/StatsStrip';
import CounterPanel from '../components/CounterPanel';
import AlertsByClassCard from '../components/AlertsByClassCard';
import AgentVersionsCard from '../components/AgentVersionsCard';
import MonitorPresenceCard from '../components/MonitorPresenceCard';
import BrandDistributionCard from '../components/BrandDistributionCard';
import TopClientsCard from '../components/TopClientsCard';
import { fmt } from '../../../shared/lib/formatters';

/** Rediseño hifi "Panel de Control" (handoff 25/08/2026): tres preguntas en
 * orden — ¿qué está roto ahora? (titulares) → ¿cuál es el estado global del
 * parque? (tira de KPIs) → ¿qué colas tengo que atender hoy? (alertas +
 * colas + detalle operativo). Área de contenido únicamente — sidebar/topbar
 * son de `app/layout/` y no se tocan acá. */

function headerDate(d: Date): string {
  const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function minutesAgo(from: Date, now: number): number {
  return Math.max(0, Math.round((now - from.getTime()) / 60_000));
}

const Dashboard = () => {
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
      ? lastSyncAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : `hace ${minutesAgo(lastSyncAt, Date.now())}m`)
    : '';

  // Estado de error "duro" por bloque: sólo cuando jamás hubo datos buenos —
  // si ya cargó una vez, un poll fallido no tumba las tarjetas a la vista de
  // error (ver comentario del chip arriba).
  const mainError = error && !data;
  const mainLoading = loading && !data;

  return (
    <div className="-m-4 flex flex-col bg-surface-page px-[34px] pb-9 pt-[30px] md:-m-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="block h-0.5 w-5 bg-brand" />
            <span className="font-montserrat text-[9px] font-bold uppercase leading-none tracking-[.19em] text-ink-300">
              Visión estratégica de la infraestructura global
            </span>
          </div>
          <h1 className="m-0 font-montserrat text-[34px] font-extrabold leading-[1.05] tracking-[-.018em] text-ink-900">
            Panel de control
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-[7px] rounded-[2px] bg-brand-soft px-2.5 py-1 font-montserrat text-[9.5px] font-semibold uppercase leading-none tracking-[.1em] text-brand-accent">
              <span className="block h-1.5 w-1.5 rounded-full" style={{ background: synced ? 'var(--color-brand)' : 'var(--color-brand-severe)' }} />
              {synced ? `SINCRONIZADO ${syncLabel}` : `SIN SINCRONIZAR${syncLabel ? ` · ${syncLabel}` : ''}`}
            </span>
            {data?.stats && (
              <span className="font-sans text-[12.5px] text-ink-400">
                {headerDate(new Date())} · {fmt(data.stats.clients)} clientes · {fmt(data.stats.devices)} dispositivos
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2.5">
          <Link
            to="/clients"
            className="rounded-[3px] border border-line-300 bg-white px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-ink-600 transition-colors duration-150 ease-in-out hover:border-line-hover hover:bg-surface-btn-hover focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            + NUEVO CLIENTE
          </Link>
          <Link
            to="/agents"
            className="rounded-[3px] bg-brand px-[18px] py-[11px] font-montserrat text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-white transition-colors duration-150 ease-in-out hover:bg-brand-severe focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
          >
            GESTIONAR AGENTES
          </Link>
        </div>
      </div>

      <HeadlineCards
        stats={data?.stats}
        alertsByClass={data?.alertsByClass}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      <StatsStrip
        stats={data?.stats}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
        supplies={supplies}
        suppliesLoading={suppliesLoading}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.42fr_1fr]">
        <AlertsByClassCard
          alertsByClass={data?.alertsByClass}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CounterPanel
            title="Dispositivos pendientes de registro"
            to="/pending"
            loading={mainLoading}
            error={mainError}
            onRetry={fetchDashboardData}
            cells={[
              { label: 'Descubiertos hoy', value: d?.today ?? 0, severity: 'warning' },
              { label: 'Ayer', value: d?.yesterday ?? 0, severity: 'warning' },
              { label: 'Pendientes', value: d?.pendingTotal ?? 0, severity: 'warning' },
            ]}
          />
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
          <CounterPanel
            title="Solicitudes de consumibles"
            to="/supply-requests"
            loading={supplyRequestsLoading && !supplyRequests}
            error={supplyRequestsError && !supplyRequests}
            onRetry={retrySupplyRequests}
            cells={[
              { label: 'Pendientes', value: sr.pending ?? 0, severity: 'critical' },
              { label: 'Procesadas', value: sr.processed ?? 0, severity: 'warning' },
              { label: 'Completadas', value: sr.completed ?? 0, severity: 'ok' },
            ]}
          />
          <CounterPanel
            title="Incidencias"
            to="/incidents"
            loading={incidentsLoading && !incidents}
            error={incidentsError && !incidents}
            onRetry={retryIncidents}
            cells={[
              { label: 'Abiertas', value: inc.open ?? 0, severity: 'critical' },
              { label: 'En curso', value: inc.in_progress ?? 0, severity: 'warning' },
              { label: 'Cerradas', value: inc.closed ?? 0, severity: 'ok' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[.85fr_.95fr_1.05fr_1.25fr]">
        <MonitorPresenceCard
          agents={data?.stats?.agents}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        <AgentVersionsCard
          agentVersions={data?.agentVersions}
          currentAgentVersion={data?.currentAgentVersion}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        <BrandDistributionCard
          brands={data?.brands}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
        <TopClientsCard
          topClients={data?.topClients}
          totalClients={data?.stats?.clients}
          loading={mainLoading}
          error={mainError}
          onRetry={fetchDashboardData}
        />
      </div>
    </div>
  );
};

export default Dashboard;
