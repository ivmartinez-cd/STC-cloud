import type { SnapshotCounters, SnapshotRow } from "../entities/dashboard-snapshot";

/** Lo que el job mide para UN cliente en una toma. */
export interface ClientSnapshot extends SnapshotCounters {
  clientId: string;
  alertsByClass: Record<string, number>;
}

export interface DashboardSnapshotRepository {
  /** Ids de todos los clientes — el job toma una muestra por cliente en cada tick. */
  allClientIds(): Promise<string[]>;
  /** Alertas ACTIVAS por clase, por cliente, en una sola pasada. */
  openAlertsByClientAndClass(): Promise<Map<string, Record<string, number>>>;
  /** Equipos vivos y gestionados (`monitor_state <> 'disabled'`), por cliente. */
  deviceCountsByClient(): Promise<Map<string, { total: number; managed: number }>>;
  /** Agentes no revocados y con heartbeat reciente, por cliente. */
  agentCountsByClient(onlineSince: Date): Promise<Map<string, { total: number; online: number }>>;
  /** Escribe la toma (idempotente por (client_id, at)). */
  saveSnapshots(at: Date, rows: ClientSnapshot[]): Promise<void>;
  /** Tomas de la ventana, de los clientes del scope, ordenadas por `at` ascendente. */
  snapshotsSince(since: Date, clientId: string | null): Promise<SnapshotRow[]>;
}
