import { Knex } from "knex";
import { writeAudit } from "../auditService";

// ─── Acciones en bloque (Fase 9 del gap analysis vs HP SDS) ────────────────
//
// Deliberadamente NO se refactorizan `decommissionDevice`/`recommissionDevice`/
// `moveDevice` de `deviceController.ts` para que llamen a estas funciones: esos
// tres hacen locking por fila (`forUpdate`) + validaciones puntuales sobre UN
// equipo, mientras que acá la forma natural es "clasificar todos los ids en
// applied/skipped con una query, después un UPDATE en lote" — el mismo patrón
// que ya usa `decommissionStaleDevices` en `deviceController.ts` (única fila de
// audit con la lista de ids, no una por dispositivo). Forzar una firma común
// hubiera significado degradar el camino single-device a un loop de a uno, o
// forzar el camino bulk a N transacciones — ninguna receta gana claridad.

export const MAX_BULK_DEVICE_IDS = 500;

export interface BulkSkip {
  id: string;
  reason: "not_found" | "merged" | "already_decommissioned" | "not_decommissioned" | "same_agent" | "collision" | "confirm_required";
}

export interface BulkResult {
  count: number;
  applied: string[];
  skipped: BulkSkip[];
}

export class BulkActionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type BulkScope = { kind: "all" } | { kind: "client"; id: string };

function assertBulkIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new BulkActionError("ids es requerido");
  if (ids.length > MAX_BULK_DEVICE_IDS) throw new BulkActionError(`ids no puede tener más de ${MAX_BULK_DEVICE_IDS} elementos`);
}

/** Devuelve las filas de `devices` que matchean `ids` Y el scope — un id ajeno simplemente no vuelve (mismo criterio que deviceRegistrationService: no se distingue "no existe" de "no es tuyo"). */
async function scopedDeviceRows(trx: Knex.Transaction, ids: string[], scope: BulkScope) {
  const rows = await trx("devices")
    .whereIn("id", ids)
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .forUpdate();
  return new Map<string, any>(rows.map((r: any) => [r.id, r]));
}

export async function bulkDecommission(
  db: Knex,
  params: { ids: string[]; reason: string; scope: BulkScope; actorId?: string | null; ip?: string | null; dryRun?: boolean }
): Promise<BulkResult> {
  assertBulkIds(params.ids);
  if (!params.reason?.trim()) throw new BulkActionError("El motivo es obligatorio");

  return db.transaction(async (trx) => {
    const byId = await scopedDeviceRows(trx, params.ids, params.scope);
    const applied: string[] = [];
    const skipped: BulkSkip[] = [];
    for (const id of params.ids) {
      const row = byId.get(id);
      if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
      if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
      if (row.decommissioned_at) { skipped.push({ id, reason: "already_decommissioned" }); continue; }
      applied.push(id);
    }

    // `dryRun`: se clasifica todo (para que la UI muestre el preview exacto:
    // cuántos aplicarían, cuántos quedarían afuera y por qué) pero no se
    // escribe nada — misma idea que `decommissionStaleDevices`, sólo que acá
    // la clasificación es por selección explícita, no por corte de inactividad.
    if (params.dryRun) return { count: applied.length, applied, skipped };

    if (applied.length > 0) {
      await trx("devices").whereIn("id", applied).update({
        decommissioned_at: new Date(),
        decommissioned_by: params.actorId ?? null,
        decommission_reason: params.reason.trim(),
        active: false,
      });
      // Mismo argumento que el `decommissionDevice` single: un `device_offline`
      // reabierto sobre un equipo dado de baja seguiría notificando al cliente.
      await trx("alerts").whereIn("device_id", applied).where("resolved", false).update({
        resolved: true, resolved_at: new Date(),
      });
      const clientIds = new Set(applied.map((id) => byId.get(id)?.client_id).filter(Boolean));
      await writeAudit(trx, {
        action: "DEVICES_BULK_DECOMMISSIONED",
        targetId: null,
        clientId: clientIds.size === 1 ? ([...clientIds][0] as string) : null,
        userId: params.actorId ?? null,
        ip: params.ip ?? null,
        metadata: { device_ids: applied, count: applied.length, reason: params.reason.trim(), skipped },
      });
    }

    return { count: applied.length, applied, skipped };
  });
}

export async function bulkRecommission(
  db: Knex,
  params: { ids: string[]; reason?: string | null; scope: BulkScope; actorId?: string | null; ip?: string | null }
): Promise<BulkResult> {
  assertBulkIds(params.ids);

  return db.transaction(async (trx) => {
    const byId = await scopedDeviceRows(trx, params.ids, params.scope);
    const applied: string[] = [];
    const skipped: BulkSkip[] = [];
    for (const id of params.ids) {
      const row = byId.get(id);
      if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
      if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
      if (!row.decommissioned_at) { skipped.push({ id, reason: "not_decommissioned" }); continue; }
      applied.push(id);
    }

    if (applied.length > 0) {
      await trx("devices").whereIn("id", applied).update({
        decommissioned_at: null, decommissioned_by: null, decommission_reason: null,
      });
      const clientIds = new Set(applied.map((id) => byId.get(id)?.client_id).filter(Boolean));
      await writeAudit(trx, {
        action: "DEVICES_BULK_RECOMMISSIONED",
        targetId: null,
        clientId: clientIds.size === 1 ? ([...clientIds][0] as string) : null,
        userId: params.actorId ?? null,
        ip: params.ip ?? null,
        metadata: { device_ids: applied, count: applied.length, reason: params.reason?.trim() || null, skipped },
      });
    }

    return { count: applied.length, applied, skipped };
  });
}

export async function bulkMove(
  db: Knex,
  params: { ids: string[]; agentId: string; reason: string; confirmClientChange?: boolean; scope: BulkScope; actorId?: string | null; ip?: string | null }
): Promise<BulkResult> {
  assertBulkIds(params.ids);
  if (!params.reason?.trim()) throw new BulkActionError("El motivo es obligatorio");

  return db.transaction(async (trx) => {
    const targetAgent = await trx("agents").where({ id: params.agentId }).first();
    if (!targetAgent || targetAgent.status === "revoked") throw new BulkActionError("Monitor destino no encontrado", 404);
    if (params.scope.kind === "client" && targetAgent.client_id !== params.scope.id) {
      throw new BulkActionError("Monitor destino no encontrado", 404);
    }

    const byId = await scopedDeviceRows(trx, params.ids, params.scope);
    const applied: string[] = [];
    const skipped: BulkSkip[] = [];
    const eligible: any[] = [];
    for (const id of params.ids) {
      const row = byId.get(id);
      if (!row) { skipped.push({ id, reason: "not_found" }); continue; }
      if (row.merged_into) { skipped.push({ id, reason: "merged" }); continue; }
      if (row.agent_id === params.agentId) { skipped.push({ id, reason: "same_agent" }); continue; }
      if (row.client_id !== targetAgent.client_id && !params.confirmClientChange) {
        skipped.push({ id, reason: "confirm_required" }); continue;
      }
      eligible.push(row);
    }

    // Colisión de serial contra el cliente destino — una sola query para
    // todos los elegibles en vez de una por dispositivo. `whereNotIn` con los
    // propios ids elegibles: un equipo no puede "colisionar consigo mismo".
    const serials = eligible.filter((r) => r.serial_number).map((r) => String(r.serial_number).toUpperCase());
    const collisions = serials.length
      ? await trx("devices")
          .where("client_id", targetAgent.client_id)
          .whereNull("merged_into")
          .whereNotIn("id", eligible.map((r) => r.id))
          .whereRaw(`upper(btrim(serial_number)) = ANY(?)`, [serials])
          .select("id", "serial_number")
      : [];
    const collisionBySerial = new Map<string, string>(); // serial upper -> id ajeno que ya lo tiene
    for (const c of collisions as any[]) {
      if (c.serial_number) collisionBySerial.set(String(c.serial_number).toUpperCase(), c.id);
    }

    for (const row of eligible) {
      const serialUp = row.serial_number ? String(row.serial_number).toUpperCase() : null;
      if (serialUp && collisionBySerial.has(serialUp)) {
        skipped.push({ id: row.id, reason: "collision" });
        continue;
      }
      applied.push(row.id);
    }

    if (applied.length > 0) {
      await trx("devices").whereIn("id", applied).update({
        agent_id: params.agentId,
        client_id: targetAgent.client_id,
        agent_reassigned_at: new Date(),
      });
      await trx("alerts").whereIn("device_id", applied).where("resolved", false).update({
        resolved: true, resolved_at: new Date(),
      });
      await writeAudit(trx, {
        action: "DEVICES_BULK_MOVED",
        targetId: params.agentId,
        clientId: targetAgent.client_id,
        userId: params.actorId ?? null,
        ip: params.ip ?? null,
        metadata: { device_ids: applied, count: applied.length, to_agent_id: params.agentId, to_client_id: targetAgent.client_id, reason: params.reason.trim(), skipped },
      });
    }

    return { count: applied.length, applied, skipped };
  });
}
