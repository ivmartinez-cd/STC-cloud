import type { StaleDeviceRow } from "../../domain/entities/device";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import { staleCutoff } from "../../domain/services/device-rules";
import type { DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { DecommissionStaleInput } from "../dtos/device-dtos";

/**
 * Purga por inactividad colgada de `/agents/:id` — hereda el chequeo central
 * de ownership, da de baja en vez de borrar, soporta dry-run y devuelve
 * siempre la lista completa (no sólo el conteo). Una sola fila de audit con
 * la lista de ids.
 */
export class DecommissionStaleDevicesUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: DecommissionStaleInput): Promise<{ count: number; devices: StaleDeviceRow[] }> {
    const { days, cutoff } = staleCutoff(input.inactiveDays);
    const targets = await this.devices.findStale(input.agentId, cutoff);
    if (input.dryRun || targets.length === 0) return { count: targets.length, devices: targets };

    const ids = targets.map((t) => t.id);
    const reason = input.reason?.trim() || `Sin actividad por ${days} días (purga automática)`;
    await this.unitOfWork.run(async (tx) => {
      await tx.devices.setDecommissioned(ids, { by: input.userId, reason });
      await tx.devices.resolveOpenAlerts(ids);
      await tx.audit.write({
        action: "DEVICES_BULK_DECOMMISSIONED", targetId: input.agentId, clientId: targets[0]?.client_id ?? null,
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: { agent_id: input.agentId, inactive_days: days, count: ids.length, device_ids: ids, reason: input.reason?.trim() || null },
      });
    });
    return { count: ids.length, devices: targets };
  }
}
