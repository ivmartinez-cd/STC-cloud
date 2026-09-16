import { useEffect } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import { useDashboardTrend, useAlertHotspots } from '../hooks/useDashboardTrend';
import { useDashboardUrlState } from '../hooks/useDashboardUrlState';
import { useWorkQueue } from '../hooks/useWorkQueue';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import HotspotsPanel from '../components/HotspotsPanel';
import WorkQueueSection from '../components/WorkQueueSection';
import AlertsByClassPanel from '../components/AlertsByClassPanel';
import SeverityPanel from '../components/SeverityPanel';
import AgentsSection from '../components/AgentsSection';
import BrandsSection from '../components/BrandsSection';
import AccountsSection from '../components/AccountsSection';
import { fmt, APP_LOCALE } from '../../../shared/lib/formatters';
import { useAuth } from '../../../store/AuthContext';

/**
 * Panel de control (handoff "Panel de control", 16/09/2026 — segunda tanda).
 *
 * Qué cambia respecto de la primera: la página vuelve a tener SUPERFICIE. La
 * tanda anterior había quitado toda caja y resolvía la jerarquía con reglas
 * hairline sobre el fondo de la página; con la llegada de la columna lateral
 * eso dejaba bloques flotando sin borde de lectura. Ahora hay un solo nivel —
 * panel blanco con borde de 1px sobre lienzo cálido — y ninguna tarjeta
 * anidada, ni radio, ni sombra, ni degradado.
 *
 * Lo que el rediseño agrega de fondo es TENDENCIA y ACCIÓN:
 * - cada cifra del titular trae su variación y su curva del período;
 * - el panel "Dónde se concentran las alertas" dice de dónde sale el número
 *   grande, no sólo cuánto vale;
 * - cada fila operable (clase, hotspot, cola) lleva a su destino ya filtrado y
 *   dice el verbo.
 *
 * Toda la tendencia sale de tomas reales (`dashboard_snapshots`, una por hora).
 * Lo que todavía no tiene historia no dibuja curva: no hay dato de ejemplo en
 * esta pantalla.
 *
 * Área de contenido únicamente — sidebar/topbar son de `app/layout/` y
 * mantienen su propio handoff (26/08/2026).
 */

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
  const { range, by, setRange, setBy } = useDashboardUrlState();
  const { data, loading, error, lastSyncAt, fetchDashboardData } = useDashboard();
  const extras = useDashboardExtras();
  const { trend } = useDashboardTrend(range);
  const { hotspots, hotspotsLoading, hotspotsError, retryHotspots } = useAlertHotspots(by);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

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
  const queue = useWorkQueue({ data, extras, isClientViewer, mainLoading, mainError, retryMain: fetchDashboardData });

  const meta = data?.stats
    ? `${headerDate(new Date())}${isClientViewer ? '' : ` · ${fmt(data.stats.clients)} clientes`} · ${fmt(data.stats.devices)} dispositivos`
    : null;

  return (
    <div className="-m-4 flex max-w-[1280px] flex-col gap-5 bg-surface-page px-[clamp(18px,3vw,36px)] pb-12 pt-[26px] short:gap-4 short:pb-8 short:pt-5 md:-m-10">
      <PageHeader
        // "global" es cierto para quien ve toda la red; a un cliente, que sólo ve
        // sus propios equipos, le prometía algo que no es.
        eyebrow={isClientViewer ? 'Estado de su infraestructura monitoreada' : 'Visión estratégica de la infraestructura global'}
        synced={synced} syncLabel={syncLabel} meta={meta} action={!isClientViewer}
        range={range} onRangeChange={setRange}
      />

      <KpiStrip
        stats={data?.stats}
        alertsByClass={data?.alertsByClass}
        supplies={extras.supplies}
        suppliesLoading={extras.suppliesLoading}
        trend={trend}
        range={range}
        loading={mainLoading}
        error={mainError}
        onRetry={fetchDashboardData}
      />

      {/* Columna principal (detalle) + lateral (lo que se atiende). Al angostarse,
          la lateral baja debajo y ocupa el ancho completo — sin media queries. */}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_540px] flex-col gap-5">
          <HotspotsPanel
            data={hotspots} by={by} onChangeTab={setBy}
            loading={hotspotsLoading} error={hotspotsError} onRetry={retryHotspots}
          />
          <AlertsByClassPanel
            alertsByClass={data?.alertsByClass} trend={trend} range={range}
            loading={mainLoading} error={mainError} onRetry={fetchDashboardData}
          />
          <div className="flex flex-wrap gap-5">
            <div className="min-w-0 flex-[1_1_250px]">
              <BrandsSection brands={data?.brands} loading={mainLoading} error={mainError} onRetry={fetchDashboardData} />
            </div>
            {/* Ranking de cuentas: es una vista de cartera del proveedor. El backend ya
                devuelve sólo el cliente propio, así que para él sería una lista de uno. */}
            {!isClientViewer && (
              <div className="min-w-0 flex-[1_1_250px]">
                <AccountsSection
                  topClients={data?.topClients}
                  totalClients={data?.stats?.clients}
                  totalDevices={data?.stats?.devices}
                  loading={mainLoading} error={mainError} onRetry={fetchDashboardData}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <SeverityPanel
            alertsByClass={data?.alertsByClass} trend={trend} range={range}
            loading={mainLoading} error={mainError} onRetry={fetchDashboardData}
          />
          <WorkQueueSection items={queue.items} loading={queue.loading} error={queue.error} onRetry={queue.retry} />
          <AgentsSection
            agentVersions={data?.agentVersions}
            currentAgentVersion={data?.currentAgentVersion}
            publishedAgentVersions={data?.publishedAgentVersions}
            loading={mainLoading} error={mainError} onRetry={fetchDashboardData}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
