import type { Knex } from "knex";
import type { AgentScope } from "../../domain/entities/agent";
import type {
  AgentDirectoryFilters, AgentDirectoryResponse, AgentDirectoryRow, AgentFleetSummary, AgentSignalBucketsResponse,
} from "../../domain/entities/agent-directory";
import type { AgentDirectoryRepository } from "../../domain/repositories/agent-directory-repository";

/**
 * Listado/resumen/distribución de "Salud de nodos" (handoff hifi, 25/08/2026).
 * Repo NUEVO y separado de `KnexAgentPortalRepository` A PROPÓSITO: ese archivo
 * ya está en el techo del ratchet de `check:sizes` (`scripts/sizes-baseline.json`,
 * 523 líneas) y no tiene margen para crecer. Mismo criterio que
 * `AGENT_DEVICE_ESTADO_SQL` de ese archivo, pero a nivel AGENTE (no
 * dispositivo) y para TODA la flota de una sola pasada.
 */

// 3 estados del chip de fila (spec del handoff): REPORTANDO <1h, SIN SEÑAL
// 1h-48h, INACTIVO >48h (o sin `last_seen` nunca).
const AGENT_ESTADO_SQL = `
  CASE
    WHEN agents.last_seen IS NOT NULL AND agents.last_seen >= NOW() - INTERVAL '1 hour' THEN 'reportando'
    WHEN agents.last_seen IS NOT NULL AND agents.last_seen >= NOW() - INTERVAL '48 hours' THEN 'sin_senal'
    ELSE 'inactivo'
  END
`;

// 4 buckets de la tira "Distribución por antigüedad de señal" — MÁS granular
// que el chip de fila de arriba; el propio handoff los trata como cosas
// distintas (la muestra del mockup usa el chip SIN SEÑAL desde "hace 7h" hasta
// "hace 14h", cruzando dos buckets de la distribución).
const AGENT_BUCKET_SQL = `
  CASE
    WHEN agents.last_seen IS NOT NULL AND agents.last_seen >= NOW() - INTERVAL '1 hour' THEN 'menos_1h'
    WHEN agents.last_seen IS NOT NULL AND agents.last_seen >= NOW() - INTERVAL '6 hours' THEN 'una_a_6h'
    WHEN agents.last_seen IS NOT NULL AND agents.last_seen >= NOW() - INTERVAL '48 hours' THEN 'seis_a_48h'
    ELSE 'mas_48h'
  END
`;

// Proyección SINTÉTICA de vencimiento de llave — no existe `rotated_at` real
// en el esquema (mismo criterio que `getLicense()` en
// `knex-agent-portal-repository.ts`, pero para TODA la flota en una sola
// pasada de SQL): próxima rotación cada 90 días desde `created_at`, proyectada
// hasta la primera ocurrencia futura.
const KEY_EXPIRING_30D_SQL = `
  agents.status <> 'revoked' AND agents.created_at +
    ((floor(extract(epoch FROM (now() - agents.created_at)) / 7776000) + 1) * interval '90 days')
    < now() + interval '30 days'
`;

// Equipos "vivos" de este agente (mismo criterio que
// `notDecommissionedNotMergedNotIgnored` del repo hermano, incluye `pending`).
const DEVICE_COUNT_JOIN_SQL = `
  (SELECT agent_id, COUNT(*)::int AS device_count FROM devices
    WHERE decommissioned_at IS NULL AND merged_into IS NULL AND registration_state <> 'ignored'
    GROUP BY agent_id) dc
`;

const BUCKET_LABELS: Record<string, string> = {
  menos_1h: "Reportando · menos de 1 h",
  una_a_6h: "Retraso · 1 a 6 h",
  seis_a_48h: "Sin señal · 6 a 48 h",
  mas_48h: "Sin señal · más de 48 h",
};
const BUCKET_ORDER = ["menos_1h", "una_a_6h", "seis_a_48h", "mas_48h"];

const DIRECTORY_ROW_COLUMNS = [
  "rows.id", "rows.name", "rows.hardware_id", "rows.version", "rows.status", "rows.last_seen",
  "rows.client_id", "rows.client_name", "rows.device_count", "rows.estado", "rows.version_stale", "rows.remote_ews_enabled",
];

function scoped(q: Knex.QueryBuilder, scope: AgentScope, col = "agents.client_id") {
  if (scope.kind === "client") q.where(col, scope.id);
  return q;
}

export class KnexAgentDirectoryRepository implements AgentDirectoryRepository {
  constructor(private readonly db: Knex) {}

  private base(scope: AgentScope, publishedVersion: string) {
    const db = this.db;
    return db("agents")
      .leftJoin("clients", "clients.id", "agents.client_id")
      .leftJoin(db.raw(DEVICE_COUNT_JOIN_SQL), "dc.agent_id", "agents.id")
      .modify((q) => scoped(q, scope))
      .select(
        "agents.id", "agents.name", "agents.hardware_id", "agents.version", "agents.status", "agents.last_seen",
        "agents.client_id", "clients.name as client_name", "agents.remote_ews_enabled",
        db.raw("COALESCE(dc.device_count, 0)::int as device_count"),
        db.raw(`(${AGENT_ESTADO_SQL}) as estado`),
        db.raw("(agents.version IS DISTINCT FROM ?) as version_stale", [publishedVersion]),
        db.raw(`(${KEY_EXPIRING_30D_SQL}) as key_expiring`)
      );
  }

  private applyFilters(q: Knex.QueryBuilder, filters: AgentDirectoryFilters) {
    if (filters.q) {
      const term = filters.q;
      q.andWhere((b) => {
        b.whereRaw("name ILIKE ?", [`%${term}%`])
          .orWhereRaw("hardware_id ILIKE ?", [`%${term}%`])
          .orWhereRaw("client_name ILIKE ?", [`%${term}%`]);
      });
    }
    if (filters.segment === "sin_senal") q.whereIn("estado", ["sin_senal", "inactivo"]);
    else if (filters.segment === "desactualizados") q.where("version_stale", true);
    else if (filters.segment === "llave_por_vencer") q.where("key_expiring", true);
    return q;
  }

  private filtered(filters: AgentDirectoryFilters) {
    const rows = this.base(filters.scope, filters.publishedVersion).as("rows");
    return this.db.select(DIRECTORY_ROW_COLUMNS).from(rows).modify((q) => this.applyFilters(q, filters));
  }

  async listDirectory(filters: AgentDirectoryFilters): Promise<AgentDirectoryResponse> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
    const [items, [{ count }]] = await Promise.all([
      this.filtered(filters).orderByRaw(`last_seen ${sortDir} NULLS LAST`).orderBy("name", "asc").limit(limit).offset(offset),
      this.filtered(filters).clearSelect().count("* as count"),
    ]);
    return { items: items as AgentDirectoryRow[], total: Number(count) };
  }

  private fleetAgentsQuery(scope: AgentScope, publishedVersion: string) {
    const db = this.db;
    return db("agents").modify((q) => scoped(q, scope)).select(
      db.raw("COUNT(*)::int as total"),
      db.raw("COUNT(*) FILTER (WHERE agents.last_seen IS NULL OR agents.last_seen < NOW() - INTERVAL '6 hours')::int as stale_over_6h"),
      db.raw("COUNT(*) FILTER (WHERE agents.version IS DISTINCT FROM ?)::int as outdated", [publishedVersion]),
      db.raw(`COUNT(*) FILTER (WHERE ${KEY_EXPIRING_30D_SQL})::int as key_expiring_30d`)
    ).first();
  }

  private fleetClientsQuery(scope: AgentScope) {
    return this.db("clients").modify((q) => { if (scope.kind === "client") q.where("id", scope.id); }).count("* as c").first();
  }

  async getFleetSummary(scope: AgentScope, publishedVersion: string): Promise<AgentFleetSummary> {
    const [agentsRow, clientsRow] = await Promise.all([this.fleetAgentsQuery(scope, publishedVersion), this.fleetClientsQuery(scope)]);
    return {
      agents_total: Number(agentsRow?.total ?? 0),
      clients_total: Number(clientsRow?.c ?? 0),
      stale_over_6h: Number(agentsRow?.stale_over_6h ?? 0),
      outdated: Number(agentsRow?.outdated ?? 0),
      published_version: publishedVersion,
      key_expiring_30d: Number(agentsRow?.key_expiring_30d ?? 0),
    };
  }

  async getSignalBuckets(scope: AgentScope): Promise<AgentSignalBucketsResponse> {
    const db = this.db;
    const rows: Array<{ bucket: string; count: string }> = await db("agents")
      .modify((q) => scoped(q, scope))
      .select(db.raw(`(${AGENT_BUCKET_SQL}) as bucket`))
      .count("* as count")
      .groupBy("bucket");
    const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const buckets = BUCKET_ORDER.map((key) => {
      const count = counts.get(key) ?? 0;
      return { key, label: BUCKET_LABELS[key], count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
    });
    return { buckets, total };
  }
}
