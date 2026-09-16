import type { Knex } from "knex";
import { LIVE_SQL } from "../../../../api/utils/deviceFilters";
import type { HotspotKind } from "../../domain/entities/alert-hotspot";
import type { AlertHotspotsRepository, HotspotTopRow } from "../../domain/repositories/alert-hotspots-repository";

/**
 * "Dónde se concentran las alertas": top de equipos / cuentas por alertas
 * ACTIVAS, con el desglose por clase de cada uno.
 *
 * Dos pasadas a propósito: primero el top-N por cantidad (barato, agrupa y
 * ordena), después el desglose por clase SÓLO de esos N. Traer todas las
 * alertas para agrupar en memoria escalaría con el parque, no con las 5 filas
 * que se dibujan.
 *
 * Sólo alertas con equipo: una alerta agent-scoped (sin `device_id`) no tiene
 * "dónde" que mostrar en la vista de equipos, y en la de cuentas se contaría
 * distinto del número grande de arriba. Lo dice el pie del panel.
 *
 * Las dos variantes de cada consulta son literales separados, no un `${key}`
 * interpolado: la columna de agrupación no viaja como texto a ningún SQL
 * (`check-guards`, regla `sql-interpolation`). El único valor variable es el
 * cliente, y va como binding.
 *
 * El scope se escribe `?::uuid IS NULL OR d.client_id = ?::uuid` y NO
 * `? = '' OR …`: Postgres castea la constante del segundo operando aunque el
 * primero sea verdadero (no hay corto circuito garantizado en la planificación),
 * y `''::uuid` revienta con 22P02. Un `NULL` tipado no tiene ese problema.
 */

const DEVICE_SCOPE = `WHERE a.resolved = false AND ${LIVE_SQL("d")} AND (?::uuid IS NULL OR d.client_id = ?::uuid)`;

const DEVICE_TOP_SQL = `
  SELECT d.id,
         COALESCE(NULLIF(d.name, ''), NULLIF(d.model, ''), d.serial_number) AS name,
         c.name AS meta_a,
         COALESCE(NULLIF(d.location, ''), d.hostname) AS meta_b,
         d.serial_number AS serial,
         COUNT(*)::int AS count
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  JOIN clients c ON c.id = d.client_id
  ${DEVICE_SCOPE}
  GROUP BY d.id, c.name
  ORDER BY count DESC, name ASC
  LIMIT ?
`;

const CLIENT_TOP_SQL = `
  SELECT c.id,
         c.name,
         (SELECT COUNT(*)::text FROM devices dd WHERE dd.client_id = c.id AND ${LIVE_SQL("dd")}) AS meta_a,
         (SELECT COUNT(DISTINCT NULLIF(dd.location, ''))::text FROM devices dd WHERE dd.client_id = c.id AND ${LIVE_SQL("dd")}) AS meta_b,
         COUNT(*)::int AS count
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  JOIN clients c ON c.id = d.client_id
  ${DEVICE_SCOPE}
  GROUP BY c.id, c.name
  ORDER BY count DESC, c.name ASC
  LIMIT ?
`;

const CLASSES_BASE = `
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  WHERE a.resolved = false AND ${LIVE_SQL("d")}
`;

const DEVICE_CLASSES_SQL = `SELECT d.id AS id, a.alert_class, COUNT(*)::int AS count ${CLASSES_BASE} AND d.id = ANY(?::uuid[]) GROUP BY 1, 2`;
const CLIENT_CLASSES_SQL = `SELECT d.client_id AS id, a.alert_class, COUNT(*)::int AS count ${CLASSES_BASE} AND d.client_id = ANY(?::uuid[]) GROUP BY 1, 2`;

const SCOPE_AND = "AND (?::uuid IS NULL OR d.client_id = ?::uuid)";
const DEVICE_TOTALS_SQL = `SELECT COUNT(*)::int AS total, COUNT(DISTINCT d.id)::int AS universe ${CLASSES_BASE} ${SCOPE_AND}`;
const CLIENT_TOTALS_SQL = `SELECT COUNT(*)::int AS total, COUNT(DISTINCT d.client_id)::int AS universe ${CLASSES_BASE} ${SCOPE_AND}`;

type ClassRow = { id: string; alert_class: string | null; count: number };

export class KnexDashboardHotspotsRepository implements AlertHotspotsRepository {
  constructor(private readonly db: Knex) {}

  async top(by: HotspotKind, clientId: string | null, limit: number): Promise<HotspotTopRow[]> {
    const sql = by === "device" ? DEVICE_TOP_SQL : CLIENT_TOP_SQL;
    const { rows } = await this.db.raw(sql, [clientId, clientId, limit]);
    return rows;
  }

  async classesFor(by: HotspotKind, ids: string[]): Promise<Map<string, Record<string, number>>> {
    if (ids.length === 0) return new Map();
    const { rows }: { rows: ClassRow[] } = await this.db.raw(
      by === "device" ? DEVICE_CLASSES_SQL : CLIENT_CLASSES_SQL,
      [ids]
    );
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const byClass = out.get(r.id) ?? {};
      byClass[r.alert_class ?? "other"] = Number(r.count);
      out.set(r.id, byClass);
    }
    return out;
  }

  async totals(by: HotspotKind, clientId: string | null): Promise<{ total: number; universe: number }> {
    const sql = by === "device" ? DEVICE_TOTALS_SQL : CLIENT_TOTALS_SQL;
    const { rows } = await this.db.raw(sql, [clientId, clientId]);
    return { total: Number(rows[0]?.total ?? 0), universe: Number(rows[0]?.universe ?? 0) };
  }
}
