import type { DashboardData } from '../../../shared/types/monitor';
import type { QueueItem } from '../components/WorkQueueSection';
import type { useDashboardExtras } from './useDashboardExtras';
import { fmt } from '../../../shared/lib/formatters';

type Extras = ReturnType<typeof useDashboardExtras>;

interface Params {
  data: DashboardData | null;
  extras: Extras;
  isClientViewer: boolean;
  mainLoading: boolean;
  mainError: boolean;
  retryMain: () => void;
}

/** El orden de las filas es el de urgencia del handoff, no el de las fuentes.
 * Cada una trae su verbo: lo que se HACE con esa cola, no sólo cuánto mide. */
function queueItems(data: DashboardData | null, extras: Extras, isClientViewer: boolean): QueueItem[] {
  const d = data?.discovered;
  const inc = extras.incidents?.byStatus ?? {};
  const sr = extras.supplyRequests ?? {};
  return [
    {
      key: 'supply',
      label: 'Solicitudes de consumible',
      meta: 'pendientes de procesar',
      value: sr.pending ?? 0,
      severity: (sr.pending ?? 0) > 0 ? 'warning' : 'ok',
      action: 'Procesar',
      to: '/supply-requests',
    },
    // "Dispositivos sin alta" no tiene destino propio: no hay pantalla que
    // liste sólo los `monitor_state = 'disabled'`. Se deja sin link antes que
    // mandar a un inventario sin filtrar.
    ...(isClientViewer ? [] : [{
      key: 'unmanaged',
      label: 'Dispositivos sin alta',
      meta: `de ${fmt(data?.stats?.devices ?? 0)} en inventario`,
      value: data?.stats?.devicesUnmanaged ?? 0,
      severity: ((data?.stats?.devicesUnmanaged ?? 0) > 0 ? 'warning' : 'ok') as QueueItem['severity'],
      action: 'Dar de alta',
    }]),
    ...(isClientViewer ? [] : [{
      key: 'pending',
      label: 'Dispositivos por registrar',
      meta: `${fmt(d?.today ?? 0)} descubiertos hoy · ${fmt(d?.yesterday ?? 0)} ayer`,
      value: d?.pendingTotal ?? 0,
      severity: ((d?.pendingTotal ?? 0) > 0 ? 'warning' : 'ok') as QueueItem['severity'],
      action: 'Revisar',
      to: '/pending',
    }]),
    {
      key: 'incidents',
      label: 'Incidencias abiertas',
      meta: inc.in_progress ? `${fmt(inc.in_progress)} en curso` : 'ninguna en curso',
      value: inc.open ?? 0,
      severity: (inc.open ?? 0) > 0 ? 'critical' : 'ok',
      action: (inc.open ?? 0) > 0 ? 'Atender' : 'Crear',
      to: '/incidents',
    },
  ];
}

/**
 * "Cola de trabajo" consolida 3 fuentes independientes (`/dashboard`,
 * `/incidents/stats`, `/supply-requests/stats`): sólo se ve como
 * "cargando"/"con error" si NINGUNA de las tres trajo nunca un dato bueno —
 * mismo criterio de "última cifra buena" que el resto del panel, aplicado a
 * las tres fuentes juntas.
 */
export function useWorkQueue({ data, extras, isClientViewer, mainLoading, mainError, retryMain }: Params) {
  const loading = mainLoading && extras.incidentsLoading && !extras.incidents
    && extras.supplyRequestsLoading && !extras.supplyRequests;
  const error = mainError && extras.incidentsError && !extras.incidents
    && extras.supplyRequestsError && !extras.supplyRequests;

  return {
    items: queueItems(data, extras, isClientViewer),
    loading,
    error,
    retry: () => { retryMain(); extras.retryIncidents(); extras.retrySupplyRequests(); },
  };
}
