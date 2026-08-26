import type { Knex } from "knex";
import type { PendingQueueResponse, PendingQueueRow, PendingQueueSegment, PendingQueueSummary, SortDir } from "../../domain/entities/pending-queue";
import type { ListPendingQueueQuery } from "../../domain/repositories/device-registration-repository";

/** Lógica de la cola cross-cliente (handoff hifi "Dispositivos pendientes",
 * 25/08/2026) — archivo aparte del repo por el mismo motivo que
 * `knex-device-directory-queries.ts`/`device-inventory-summary.ts` (no empujar
 * `knex-device-registration-repository.ts` por encima del límite de tamaño). */

const WAIT_DAYS_SQL = "FLOOR(EXTRACT(EPOCH FROM (NOW() - devices.created_at)) / 86400)::int";

/** `sin_cliente` gana sobre `duplicado` (ver docblock de `PendingQueueRevision`).
 * "Duplicado" = mismo serial YA REGISTRADO en el cliente SUGERIDO del pendiente
 * (no un duplicado global) — EXISTS acotado por `client_id`, mismo criterio que
 * `devices_client_serial_uniq`. `dup.decommissioned_at IS NULL` a propósito:
 * el resolver de "Fusionar con existente" del front (`DuplicateResolverModal`)
 * encuentra el equipo YA REGISTRADO vía `DUPLICATES_SQL` (`GET /devices/duplicates`),
 * que también excluye de baja — si esta condición no lo excluyera acá, el front
 * marcaría `duplicado` para un par que el resolver después no puede encontrar. */
const REVISION_SQL = `
  CASE
    WHEN devices.client_id IS NULL THEN 'sin_cliente'
    WHEN devices.serial_number IS NOT NULL AND EXISTS (
      SELECT 1 FROM devices dup
       WHERE dup.client_id = devices.client_id
         AND dup.serial_number = devices.serial_number
         AND dup.registration_state = 'registered'
         AND dup.merged_into IS NULL
         AND dup.decommissioned_at IS NULL
    ) THEN 'duplicado'
    ELSE 'nuevo'
  END
`;

function pendingQueueBase(db: Knex, query: ListPendingQueueQuery) {
  return db("devices")
    .leftJoin("clients", "devices.client_id", "clients.id")
    .leftJoin("agents", "devices.agent_id", "agents.id")
    .where("devices.registration_state", "pending")
    .whereNull("devices.decommissioned_at")
    .whereNull("devices.merged_into")
    .modify((q) => { if (query.clientId) q.andWhere("devices.client_id", query.clientId); })
    .select(
      "devices.id", "devices.name", "devices.brand", "devices.model", "devices.serial_number", "devices.hostname",
      // `host()`, no `::text` — el cast a texto de un `inet` incluye la
      // máscara (`/32`), `host()` da la dirección limpia.
      db.raw("host(devices.ip_address) as ip_address"),
      "devices.agent_id", "agents.name as agent_name", "devices.client_id", "clients.name as client_name",
      "devices.created_at", db.raw(`${WAIT_DAYS_SQL} as wait_days`), db.raw(`(${REVISION_SQL}) as revision`),
    );
}

/** Serie/IP/hostname/modelo — mismos 4 campos que el placeholder del buscador del handoff. */
function applyPendingQueueSearch(q: Knex.QueryBuilder, term: string) {
  q.andWhere((b) => {
    b.whereRaw("serial_number ILIKE ?", [`%${term}%`])
      .orWhereRaw("ip_address ILIKE ?", [`%${term}%`])
      .orWhereRaw("hostname ILIKE ?", [`%${term}%`])
      .orWhereRaw("model ILIKE ?", [`%${term}%`]);
  });
}

function applyPendingQueueSegment(q: Knex.QueryBuilder, segment?: PendingQueueSegment) {
  if (segment === "posibles_duplicados") q.where("revision", "duplicado");
  else if (segment === "mas_7_dias") q.where("wait_days", ">=", 7);
  else if (segment === "sin_cliente") q.where("revision", "sin_cliente");
}

/** Wrap en subquery — Postgres no deja filtrar por un alias del SELECT (`revision`/
 * `wait_days`) al mismo nivel, mismo motivo que `directoryRowsFiltered`. */
function pendingQueueFiltered(db: Knex, query: ListPendingQueueQuery) {
  const rows = pendingQueueBase(db, query).as("rows");
  return db.select("rows.*").from(rows).modify((q) => {
    if (query.q) applyPendingQueueSearch(q, query.q);
    applyPendingQueueSegment(q, query.segment);
  });
}

/** Paginado por fila — orden por antigüedad, default desc (handoff: "Ordenado por
 * antigüedad · desc", columna EN ESPERA sortable). */
export async function queryPendingQueue(db: Knex, query: ListPendingQueueQuery): Promise<PendingQueueResponse> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const dirSql = query.sortDir === "asc" ? "ASC" : "DESC";
  const [rows, [{ count }]] = await Promise.all([
    pendingQueueFiltered(db, query).orderByRaw(`created_at ${dirSql}`).orderBy("id", "asc").limit(limit).offset(offset),
    pendingQueueFiltered(db, query).clearSelect().count("* as count"),
  ]);
  return { rows: rows as PendingQueueRow[], total: Number(count) };
}

interface PendingAggRow { pending_total: number; pending_clients: number; waiting_7d_plus: number; possible_duplicates: number }

/** Mismo predicado base (`pending` vivo) que `pendingQueueBase`, agregado en un
 * solo roundtrip — evita 4 queries separadas para 4 números relacionados. */
async function pendingAggregates(db: Knex): Promise<PendingAggRow> {
  const base = db("devices")
    .where("registration_state", "pending").whereNull("decommissioned_at").whereNull("merged_into")
    .select("client_id", db.raw(`${WAIT_DAYS_SQL} as wait_days`), db.raw(`(${REVISION_SQL}) as revision`))
    .as("p");
  const row = await db.from(base).select(
    db.raw("COUNT(*)::int as pending_total"),
    db.raw("COUNT(DISTINCT client_id) FILTER (WHERE client_id IS NOT NULL)::int as pending_clients"),
    db.raw("COUNT(*) FILTER (WHERE wait_days >= 7)::int as waiting_7d_plus"),
    db.raw("COUNT(*) FILTER (WHERE revision = 'duplicado')::int as possible_duplicates"),
  ).first();
  return row as PendingAggRow;
}

/** "Descubiertos" = filas de `devices` CREADAS ese día calendario (server TZ),
 * sin importar su `registration_state` actual — evento histórico de ingesta,
 * no un snapshot de la cola (a diferencia de `pendingAggregates`). */
async function discoveredCounts(db: Knex): Promise<{ discovered_today: number; discovered_yesterday: number }> {
  const row = await db("devices").select(
    db.raw("COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int as discovered_today"),
    db.raw("COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day')::int as discovered_yesterday"),
  ).first();
  return row as { discovered_today: number; discovered_yesterday: number };
}

/** `DEVICE_REGISTERED`/`DEVICE_IGNORED` del mes calendario en curso, vía `audit_logs`
 * (índice `audit_logs_action_created_at_idx`) — sin catálogo de constantes de acción
 * en el repo (`shared/domain/audit-action-catalog.ts` sólo mapea label/categoría por
 * la MISMA clave string), mismos literales que `registration-use-cases.ts::auditEach`. */
async function auditMonthCounts(db: Knex): Promise<{ approved: number; ignored: number }> {
  const rows: Array<{ action: string; count: string }> = await db("audit_logs")
    .whereIn("action", ["DEVICE_REGISTERED", "DEVICE_IGNORED"])
    .where("created_at", ">=", db.raw("date_trunc('month', now())"))
    .where("created_at", "<", db.raw("date_trunc('month', now()) + interval '1 month'"))
    .groupBy("action").select("action", db.raw("COUNT(*)::int as count"));
  return {
    approved: Number(rows.find((r) => r.action === "DEVICE_REGISTERED")?.count ?? 0),
    ignored: Number(rows.find((r) => r.action === "DEVICE_IGNORED")?.count ?? 0),
  };
}

export async function queryPendingQueueSummary(db: Knex): Promise<PendingQueueSummary> {
  const [pending, discovered, audit] = await Promise.all([pendingAggregates(db), discoveredCounts(db), auditMonthCounts(db)]);
  return {
    pending_total: pending.pending_total, pending_clients: pending.pending_clients,
    discovered_today: discovered.discovered_today, discovered_yesterday: discovered.discovered_yesterday,
    waiting_7d_plus: pending.waiting_7d_plus, possible_duplicates: pending.possible_duplicates,
    approved_this_month: audit.approved, ignored_this_month: audit.ignored,
  };
}
