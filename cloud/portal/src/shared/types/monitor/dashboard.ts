export interface DashboardData {
  stats: {
    devices: number;
    /** Fase 6 del gap analysis vs HP SDS — derivado de monitor_state='disabled'. */
    devicesUnmanaged?: number;
    /** Equipos vivos con lectura en las últimas 24h (franja "Estadísticas"). */
    devicesReporting?: number;
    agents: { total: number; online: number; reporting?: number };
    clients: number;
    volume: number;
    deviceTrend?: string | null;
    /** Aún no expuesto por `/dashboard` (handoff hifi Panel de Control: "+X%
     *  vs mes anterior" en el titular de Volumen mensual) — cuando el backend
     *  lo agregue, la tarjeta ya sabe pintarlo; mientras tanto se omite en
     *  vez de inventar un número. */
    volumeDeltaPct?: number | null;
    /** Ídem para el sparkline de 12 meses del mismo titular. */
    volumeTrend?: number[] | null;
  };
  topClients: Array<{ id: string; name: string; device_count: number }>;
  brands: Array<{ brand: string; count: number }>;
  offlineAgents: Array<{ id: string; name: string; client_name: string; last_seen: string }>;
  agentVersions?: Array<{ version: string; channel: string; count: number }>;
  /** La publicada del canal `stable` — se mantiene por compatibilidad. */
  currentAgentVersion?: string;
  /** Última publicada POR canal: el parque corre `stable` y `legacy` a la vez. */
  publishedAgentVersions?: Record<string, string>;
  alertsByClass?: Array<{ alert_class: string; label: string; count: number }>;
  discovered?: { today: number; yesterday: number; pendingTotal: number };
  /** Entradas de auditoría: hoy y ayer (`recent`) + histórico (`total`). */
  movements?: { recent: number; total: number };
  systemHealth: { status: 'healthy' | 'degraded' | 'error'; uptime: number; lastSync: string | null; lastClient?: string | null; readingsCount24h?: number; clientsWithAlertsCount?: number };
}

/* ── Tendencia y concentración (handoff "Panel de control", 16/09/2026) ────── */

export const TREND_RANGES = ['24h', '7d', '30d'] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

/** Etiqueta del chip de rango y de la meta de los paneles que dependen de él. */
export const TREND_RANGE_LABEL: Record<TrendRange, string> = {
  '24h': 'Últimas 24 h',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
};

/** Un punto de la serie. `null` = esa toma no midió la métrica (`GET /dashboard/trend`). */
export interface TrendPoint {
  at: string;
  alerts: number;
  alertsByClass: Record<string, number>;
  devicesTotal: number | null;
  devicesManaged: number | null;
  agentsTotal: number | null;
  agentsOnline: number | null;
  suppliesCritical: number | null;
  suppliesLow: number | null;
}

export interface DashboardTrend {
  range: TrendRange;
  bucket: 'hour' | 'day';
  points: TrendPoint[];
}

export const HOTSPOT_KINDS = ['device', 'client'] as const;
export type HotspotKind = (typeof HOTSPOT_KINDS)[number];

export interface AlertHotspot {
  id: string;
  name: string;
  meta: string;
  count: number;
  byClass: Record<string, number>;
  href: string;
}

export interface AlertHotspots {
  by: HotspotKind;
  items: AlertHotspot[];
  /** Alertas activas con equipo en todo el scope (pie del panel). */
  total: number;
  /** Cuántos equipos / cuentas tienen al menos una alerta activa. */
  universe: number;
}
