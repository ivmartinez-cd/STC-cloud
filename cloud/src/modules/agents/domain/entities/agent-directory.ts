import type { AgentScope } from "./agent";

/**
 * Tipos del listado hifi "Salud de nodos" (handoff 25/08/2026) — wire de
 * `GET /agents/directory`, `GET /agents/summary` y `GET /agents/signal-buckets`.
 * Archivo NUEVO, separado de `monitor-detail.ts` (detalle de UN monitor): este
 * es el LISTADO/resumen de TODA la flota. Mismo criterio que
 * `ClientDirectoryRow`/`ClientPortfolioSummary` del módulo `clients`: read
 * models snake_case calculados en el REPO, nunca en el front.
 */

/** 3 estados del chip de fila — REPORTANDO <1h, SIN SEÑAL 1h-48h, INACTIVO >48h. */
export type AgentSignalEstado = "reportando" | "sin_senal" | "inactivo";

export type AgentDirectorySegment = "sin_senal" | "desactualizados" | "llave_por_vencer";

export interface AgentDirectoryFilters {
  scope: AgentScope;
  /** Busca en nombre, hardware id y nombre de cliente. */
  q?: string;
  segment?: AgentDirectorySegment;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Resuelta por el caso de uso vía `getPublishedAgentVersion()` — el repo no conoce Redis. */
  publishedVersion: string;
}

export interface AgentDirectoryRow {
  id: string;
  name: string;
  hardware_id: string | null;
  version: string | null;
  status: string;
  last_seen: string | Date | null;
  client_id: string;
  client_name: string | null;
  device_count: number;
  estado: AgentSignalEstado;
  /** `true` cuando `version` no coincide con la versión PUBLICADA actual (incluye `null`). */
  version_stale: boolean;
  /** Estado inicial del toggle de EWS remota en `ConfigAgentModal` (evita un round-trip extra al abrirlo). */
  remote_ews_enabled: boolean;
}

export interface AgentDirectoryResponse {
  items: AgentDirectoryRow[];
  total: number;
}

/** Tira de 4 métricas de flota (handoff hifi "Salud de nodos"). */
export interface AgentFleetSummary {
  agents_total: number;
  clients_total: number;
  /** Sin señal hace más de 6 h (o nunca reportó) — más ancho que el chip de fila. */
  stale_over_6h: number;
  outdated: number;
  published_version: string;
  /** Proyección SINTÉTICA (ver docblock de `KnexAgentDirectoryRepository`). */
  key_expiring_30d: number;
}

/** Un bucket de la tira "Distribución por antigüedad de señal" — el color vive
 * en el front (token de diseño), acá sólo el conteo. */
export interface AgentSignalBucket {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface AgentSignalBucketsResponse {
  buckets: AgentSignalBucket[];
  total: number;
}
