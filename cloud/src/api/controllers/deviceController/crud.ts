import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getClientIp } from "../../utils/ip";
import { getScope } from "../../utils/scope";
import { writeAudit } from "../../../services/auditService";
import * as customFieldService from "../../../modules/inventory";
import { CustomFieldError } from "../../../modules/inventory";
import { currentUser } from "./shared";

async function updateDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  const body = request.body as Partial<{
    name: string | null; location: string | null;
    asset_number: string | null; asset_tag: string | null;
    duty_cycle_monthly: number | null; custom_data: Record<string, unknown>;
  }>;

  const existing = await db("devices")
    .where({ id })
    .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
    .first();
  if (!existing) return reply.status(404).send({ error: "Dispositivo no encontrado" });
  if (existing.merged_into) {
    return reply.status(409).send({ error: "No se puede editar un registro fusionado" });
  }

  const updates: Record<string, unknown> = {};
  // "" o null -> vuelve al valor reportado por el agente (COALESCE de la
  // columna generada ya lo resuelve solo con el override en NULL).
  if (body.name !== undefined) updates.name_override = body.name?.trim() || null;
  if (body.location !== undefined) updates.location_override = body.location?.trim() || null;
  if (body.asset_number !== undefined) updates.asset_number_override = body.asset_number?.trim() || null;
  if (body.asset_tag !== undefined) updates.asset_tag = body.asset_tag?.trim() || null;
  if (body.duty_cycle_monthly !== undefined) updates.duty_cycle_monthly_override = body.duty_cycle_monthly;
  if (body.custom_data !== undefined) {
    try {
      updates.custom_data = JSON.stringify(
        await customFieldService.validateAndMerge(db, existing.client_id, existing.custom_data, body.custom_data)
      );
    } catch (err) {
      if (err instanceof CustomFieldError) return reply.status(err.statusCode).send({ error: err.message });
      throw err;
    }
  }
  if (Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: "Nada para actualizar" });
  }

  const [updated] = await db("devices").where({ id }).update(updates).returning("*");
  const user = currentUser(request);
  await writeAudit(db, {
    action: "DEVICE_UPDATED",
    targetId: String(id),
    clientId: existing.client_id,
    userId: user?.userId ?? null,
    ip: getClientIp(request),
    metadata: { changes: Object.keys(updates) },
  });
  return updated;
}

async function deleteDevice(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const scope = getScope(request);
  try {
    await db.transaction(async (trx) => {
      const device = await trx("devices")
        .where({ id })
        .modify((q) => { if (scope.kind === "client") q.andWhere("client_id", scope.id); })
        .first();
      if (!device) throw new Error("Dispositivo no encontrado");

      const hasClosureLines = await trx("report_closure_lines").where({ device_id: id }).first();
      if (hasClosureLines) {
        throw Object.assign(new Error("Tiene historial de facturación; dalo de baja en vez de eliminarlo"), { status: 409 });
      }
      const isMergeTarget = await trx("devices").where({ merged_into: id }).first();
      if (isMergeTarget) {
        throw Object.assign(new Error("Es destino de una fusión; no se puede eliminar"), { status: 409 });
      }

      await trx("readings").where("device_id", id).del();
      await trx("alerts").where("device_id", id).del();
      const deleted = await trx("devices").where("id", id).del();
      if (!deleted) throw new Error("Dispositivo no encontrado");

      const user = currentUser(request);
      await writeAudit(trx, {
        action: "DEVICE_DELETED",
        targetId: id,
        clientId: device.client_id,
        userId: user?.userId ?? null,
        ip: getClientIp(request),
        metadata: {
          serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
          brand: device.brand, model: device.model, agent_id: device.agent_id, client_id: device.client_id,
          total_pages: device.total_pages,
        },
      });
    });

    return { success: true, message: "Dispositivo eliminado correctamente" };
  } catch (e: any) {
    const status = e?.status ?? 404;
    return reply.status(status).send({ error: e?.message ?? String(e) });
  }
}

export function createDeviceCrudHandlers(db: Knex) {
  return {
    updateDevice: (request: FastifyRequest, reply: FastifyReply) => updateDevice(db, request, reply),
    deleteDevice: (request: FastifyRequest, reply: FastifyReply) => deleteDevice(db, request, reply),
  };
}
