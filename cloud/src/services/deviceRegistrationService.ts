import { Knex } from "knex";
import { writeAudit } from "./auditService";

const MAX_BULK_IDS = 500;

export interface PendingDeviceRow {
  id: string;
  ip_address: string | null;
  mac: string | null;
  serial_number: string | null;
  hostname: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  agent_id: string | null;
  agent_name: string | null;
  created_at: string;
  last_seen: string | null;
}

export class DeviceRegistrationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function assertBulkSize(ids: string[]): void {
  if (ids.length === 0) throw new DeviceRegistrationError("deviceIds no puede estar vacío");
  if (ids.length > MAX_BULK_IDS) throw new DeviceRegistrationError(`deviceIds no puede tener más de ${MAX_BULK_IDS} elementos`);
}

/**
 * Cola de "Dispositivos pendientes de registro" (Fase 7 del gap analysis vs
 * HP SDS). Sólo equipos VIVOS (ni de baja ni fusionados) — un pendiente dado
 * de baja antes de ser revisado no debe seguir apareciendo en la cola.
 */
export async function listPending(
  db: Knex,
  params: { clientId: string; limit?: number; offset?: number; q?: string; agentId?: string }
): Promise<{ items: PendingDeviceRow[]; total: number }> {
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const build = () =>
    db("devices")
      .leftJoin("agents", "agents.id", "devices.agent_id")
      .where("devices.client_id", params.clientId)
      .where("devices.registration_state", "pending")
      .whereNull("devices.decommissioned_at")
      .whereNull("devices.merged_into")
      .modify((q) => { if (params.agentId) q.andWhere("devices.agent_id", params.agentId); })
      .modify((q) => {
        if (params.q) {
          q.andWhere((b) => {
            b.whereRaw("devices.serial_number ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.ip_address::text ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.hostname ILIKE ?", [`%${params.q}%`])
              .orWhereRaw("devices.model ILIKE ?", [`%${params.q}%`]);
          });
        }
      });

  const [items, [{ count }]] = await Promise.all([
    build()
      .select(
        "devices.id", "devices.ip_address", "devices.mac", "devices.serial_number", "devices.hostname",
        "devices.name", "devices.brand", "devices.model", "devices.agent_id", "agents.name as agent_name",
        "devices.created_at", "devices.last_seen"
      )
      .orderBy("devices.created_at", "desc")
      .limit(limit)
      .offset(offset),
    build().count("devices.id as count"),
  ]);

  return { items, total: Number(count) };
}

/** Registra en bloque — pasa `pending` → `registered`. Ids que no matcheen (no existen, no son del cliente, o no están pending) vuelven en `skipped`. */
export async function registerDevices(
  db: Knex,
  params: { clientId: string; deviceIds: string[]; actorId?: string | null; ip?: string | null }
): Promise<{ registered: number; skipped: Array<{ id: string; reason: string }> }> {
  assertBulkSize(params.deviceIds);
  const skipped: Array<{ id: string; reason: string }> = [];

  const rows = await db("devices")
    .whereIn("id", params.deviceIds)
    .select("id", "client_id", "registration_state");
  const byId = new Map(rows.map((r) => [r.id, r]));

  const toRegister: string[] = [];
  for (const id of params.deviceIds) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.client_id !== params.clientId) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.registration_state !== "pending") { skipped.push({ id, reason: "not_pending" }); continue; }
    toRegister.push(id);
  }

  if (toRegister.length > 0) {
    await db.transaction(async (trx) => {
      await trx("devices").whereIn("id", toRegister).update({
        registration_state: "registered",
        registered_at: new Date(),
        registered_by: params.actorId ?? null,
      });
      for (const id of toRegister) {
        await writeAudit(trx, {
          action: "DEVICE_REGISTERED",
          targetId: id,
          clientId: params.clientId,
          userId: params.actorId ?? null,
          ip: params.ip ?? null,
          metadata: {},
        });
      }
    });
  }

  return { registered: toRegister.length, skipped };
}

/** Ignora en bloque — pasa a `ignored` (cualquier estado previo salvo ya-ignored). Corta la ingesta de lecturas futuras (ver agentService.syncReadings/registerDevices). */
export async function ignoreDevices(
  db: Knex,
  params: { clientId: string; deviceIds: string[]; reason: string; actorId?: string | null; ip?: string | null }
): Promise<{ ignored: number; skipped: Array<{ id: string; reason: string }> }> {
  assertBulkSize(params.deviceIds);
  if (!params.reason?.trim()) throw new DeviceRegistrationError("reason es requerido");
  const skipped: Array<{ id: string; reason: string }> = [];

  const rows = await db("devices")
    .whereIn("id", params.deviceIds)
    .select("id", "client_id", "registration_state");
  const byId = new Map(rows.map((r) => [r.id, r]));

  const toIgnore: string[] = [];
  for (const id of params.deviceIds) {
    const row = byId.get(id);
    if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.client_id !== params.clientId) { skipped.push({ id, reason: "not_found" }); continue; }
    if (row.registration_state === "ignored") { skipped.push({ id, reason: "already_ignored" }); continue; }
    toIgnore.push(id);
  }

  if (toIgnore.length > 0) {
    await db.transaction(async (trx) => {
      await trx("devices").whereIn("id", toIgnore).update({
        registration_state: "ignored",
        ignored_at: new Date(),
        ignored_by: params.actorId ?? null,
        ignore_reason: params.reason.trim(),
      });
      for (const id of toIgnore) {
        await writeAudit(trx, {
          action: "DEVICE_IGNORED",
          targetId: id,
          clientId: params.clientId,
          userId: params.actorId ?? null,
          ip: params.ip ?? null,
          metadata: { reason: params.reason.trim() },
        });
      }
    });
  }

  return { ignored: toIgnore.length, skipped };
}

/** Vuelve un equipo `ignored` a `pending` — para que un operador reconsidere una ignorada por error. */
export async function unignore(
  db: Knex,
  params: { deviceId: string; reason?: string | null; actorId?: string | null; ip?: string | null }
): Promise<Record<string, unknown> | null> {
  const device = await db("devices").where({ id: params.deviceId }).first();
  if (!device) return null;
  if (device.registration_state !== "ignored") {
    throw new DeviceRegistrationError("El equipo no está ignorado", 409);
  }

  const [updated] = await db("devices")
    .where({ id: params.deviceId })
    .update({ registration_state: "pending", ignored_at: null, ignored_by: null, ignore_reason: null })
    .returning("*");

  await writeAudit(db, {
    action: "DEVICE_UNIGNORED",
    targetId: params.deviceId,
    clientId: device.client_id,
    userId: params.actorId ?? null,
    ip: params.ip ?? null,
    metadata: { reason: params.reason?.trim() || null },
  });

  return updated;
}
