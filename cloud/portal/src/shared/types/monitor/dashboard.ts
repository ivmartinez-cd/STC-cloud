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
