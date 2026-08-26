// Listado hifi "Salud de nodos" (handoff 25/08/2026) — tipos del wire de
// `GET /agents/directory`, `GET /agents/summary` y `GET /agents/signal-buckets`.
// `estado`/`version_stale`/`device_count` se calculan en el SERVIDOR
// (`KnexAgentDirectoryRepository`), nunca acá. Archivo NUEVO — no confundir con
// `shared/types/agents.ts` (el `Agent` que consumen `Monitors.tsx`/`RemoteActions.tsx`
// vía `GET /agents`, fuera de este alcance).

export type AgentSignalEstado = 'reportando' | 'sin_senal' | 'inactivo';
export type AgentSegment = 'todos' | 'sin_senal' | 'desactualizados' | 'llave_por_vencer';
export type SortDir = 'asc' | 'desc';

export interface AgentDirectoryRow {
  id: string;
  name: string;
  hardware_id: string | null;
  version: string | null;
  status: string;
  last_seen: string | null;
  client_id: string;
  client_name: string | null;
  device_count: number;
  estado: AgentSignalEstado;
  version_stale: boolean;
  remote_ews_enabled: boolean;
}

export interface AgentDirectoryResponse {
  items: AgentDirectoryRow[];
  total: number;
}

export interface AgentFleetSummary {
  agents_total: number;
  clients_total: number;
  stale_over_6h: number;
  outdated: number;
  published_version: string;
  key_expiring_30d: number;
}

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
