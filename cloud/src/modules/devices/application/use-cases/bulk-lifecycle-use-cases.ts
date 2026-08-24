import type { BulkResult, BulkSkip, DeviceRow } from "../../domain/entities/device";
import { BulkActionError } from "../../domain/errors/device-error";
import {
  assertBulkIds, classifyForDecommission, classifyForMove, classifyForRecommission, singleClientIdOf,
} from "../../domain/services/device-rules";
import type { DeviceTransactionScope, DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { BulkDecommissionInput, BulkMoveInput, BulkRecommissionInput } from "../dtos/device-dtos";

/**
 * Acciones en bloque (Fase 9). Deliberadamente NO reusan los casos de uso
 * single: esos hacen lock por fila + validaciones sobre UN equipo, acá la
 * forma natural es "clasificar todos los ids con una query, después un
 * UPDATE en lote" — una sola fila de audit con la lista de ids. Un id ajeno
 * simplemente no vuelve (no se distingue "no existe" de "no es tuyo").
 */

function requireBulkReason(reason: string | undefined | null): string {
  if (!reason?.trim()) throw new BulkActionError("El motivo es obligatorio");
  return reason.trim();
}

export class BulkDecommissionUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: BulkDecommissionInput): Promise<BulkResult> {
    assertBulkIds(input.ids);
    const reason = requireBulkReason(input.reason);
    return this.unitOfWork.run(async (tx) => {
      const byId = await tx.devices.findManyOwned(input.ids, input.scope, true);
      const { applied, skipped } = classifyForDecommission(input.ids, byId);
      // dryRun: se clasifica todo (preview exacto para la UI) pero no se escribe nada.
      if (input.dryRun || applied.length === 0) return { count: applied.length, applied, skipped };

      await tx.devices.setDecommissioned(applied, { by: input.userId, reason });
      await tx.devices.resolveOpenAlerts(applied);
      await tx.audit.write({
        action: "DEVICES_BULK_DECOMMISSIONED", targetId: null, clientId: singleClientIdOf(applied, byId),
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: { device_ids: applied, count: applied.length, reason, skipped },
      });
      return { count: applied.length, applied, skipped };
    });
  }
}

export class BulkRecommissionUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: BulkRecommissionInput): Promise<BulkResult> {
    assertBulkIds(input.ids);
    return this.unitOfWork.run(async (tx) => {
      const byId = await tx.devices.findManyOwned(input.ids, input.scope, true);
      const { applied, skipped } = classifyForRecommission(input.ids, byId);
      if (applied.length === 0) return { count: 0, applied, skipped };

      await tx.devices.clearDecommissioned(applied);
      await tx.audit.write({
        action: "DEVICES_BULK_RECOMMISSIONED", targetId: null, clientId: singleClientIdOf(applied, byId),
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: { device_ids: applied, count: applied.length, reason: input.reason?.trim() || null, skipped },
      });
      return { count: applied.length, applied, skipped };
    });
  }
}

export class BulkMoveUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: BulkMoveInput): Promise<BulkResult> {
    assertBulkIds(input.ids);
    const reason = requireBulkReason(input.reason);
    return this.unitOfWork.run(async (tx) => {
      const targetAgent = await tx.devices.findAgent(input.agentId);
      if (!targetAgent || targetAgent.status === "revoked") throw new BulkActionError("Monitor destino no encontrado", 404);
      if (input.scope.kind === "client" && targetAgent.client_id !== input.scope.id) {
        throw new BulkActionError("Monitor destino no encontrado", 404);
      }

      const byId = await tx.devices.findManyOwned(input.ids, input.scope, true);
      const { eligible, skipped } = classifyForMove(input.ids, byId, input.agentId, targetAgent.client_id, input.confirmClientChange);
      const applied = await filterSerialCollisions(tx, eligible, targetAgent.client_id, skipped);
      if (applied.length === 0) return { count: 0, applied, skipped };

      await tx.devices.reassign(applied, input.agentId, targetAgent.client_id);
      await tx.devices.resolveOpenAlerts(applied);
      await tx.audit.write({
        action: "DEVICES_BULK_MOVED", targetId: input.agentId, clientId: targetAgent.client_id,
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: { device_ids: applied, count: applied.length, to_agent_id: input.agentId, to_client_id: targetAgent.client_id, reason, skipped },
      });
      return { count: applied.length, applied, skipped };
    });
  }
}

/** Colisión de serial contra el cliente destino — una sola query para todos los elegibles. */
async function filterSerialCollisions(tx: DeviceTransactionScope, eligible: DeviceRow[], targetClientId: string, skipped: BulkSkip[]): Promise<string[]> {
  const serials = eligible.filter((r) => r.serial_number).map((r) => String(r.serial_number).toUpperCase());
  const collisions = serials.length
    ? await tx.devices.findSerialCollisions(targetClientId, serials, eligible.map((r) => r.id))
    : new Map<string, string>();
  const applied: string[] = [];
  for (const row of eligible) {
    const serialUp = row.serial_number ? String(row.serial_number).toUpperCase() : null;
    if (serialUp && collisions.has(serialUp)) { skipped.push({ id: row.id, reason: "collision" }); continue; }
    applied.push(row.id);
  }
  return applied;
}
