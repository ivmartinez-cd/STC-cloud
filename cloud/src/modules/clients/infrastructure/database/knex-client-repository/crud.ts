import type { Knex } from "knex";
import type { ClientRecord } from "../../../domain/entities/client";
import type { ClientScope } from "../../../domain/repositories/client-repository";

export function clientCountsSelect(db: Knex) {
  return [
    db.raw("COUNT(DISTINCT CASE WHEN a.status != 'revoked' THEN a.id END)::int AS monitor_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"),
    db.raw("COUNT(DISTINCT CASE WHEN a.status = 'active' AND a.last_seen > NOW() - INTERVAL '5 minutes' THEN a.id END)::int AS active_monitor_count"),
  ];
}

/**
 * `clients.sftp_destination` (Fase 19) trae `password_enc`/`private_key_enc`
 * — nunca debe viajar por ninguna vía genérica de `clients.*`/`returning('*')`,
 * sólo por el endpoint dedicado y enmascarado (`GET /clients/:id/sftp-destination`,
 * ver `client-sftp-use-cases.ts`). El resto de la tabla sigue usando `clients.*`
 * a propósito (ver docblock de `ClientRecord`) — esta es la única excepción.
 */
function stripSftpDestination<T extends Record<string, unknown>>(row: T): T {
  if ("sftp_destination" in row) delete (row as Record<string, unknown>).sftp_destination;
  return row;
}

export function clientsWithCounts(db: Knex) {
  return db("clients")
    .select("clients.*", ...clientCountsSelect(db))
    .leftJoin("agents as a", "a.client_id", "clients.id")
    .leftJoin("devices as d", "d.client_id", "clients.id")
    .groupBy("clients.id");
}

export async function existsClient(db: Knex, id: string): Promise<boolean> {
  return !!(await db("clients").where({ id }).first());
}

export async function insertClient(db: Knex, data: Record<string, unknown>): Promise<ClientRecord> {
  const [row] = await db("clients").insert(data).returning("*");
  return stripSftpDestination(row);
}

export async function updateClient(db: Knex, id: string, updates: Record<string, unknown>): Promise<ClientRecord> {
  const [row] = await db("clients").where({ id }).update(updates).returning("*");
  return stripSftpDestination(row);
}

export async function listClientsWithCounts(db: Knex, scope: ClientScope): Promise<ClientRecord[]> {
  const rows = await clientsWithCounts(db)
    .modify((q) => { if (scope.kind === "client") q.where("clients.id", scope.id); })
    .orderBy("clients.name")
    // Techo de seguridad (auditoría de capacidad, 200+ clientes), no paginación real todavía.
    .limit(2000);
  return rows.map(stripSftpDestination);
}

export async function findClientWithCounts(db: Knex, id: string): Promise<ClientRecord | null> {
  const row = await clientsWithCounts(db).where("clients.id", id).first();
  return row ? stripSftpDestination(row) : null;
}
