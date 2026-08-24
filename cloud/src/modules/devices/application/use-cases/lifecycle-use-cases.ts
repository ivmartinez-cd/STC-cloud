import type { DeviceRow } from "../../domain/entities/device";
import { DeviceMergedError, DeviceNotFoundError } from "../../domain/errors/device-error";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import { requireReason } from "../../domain/services/device-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { DecommissionDeviceInput, RecommissionDeviceInput } from "../dtos/device-dtos";

/**
 * Baja de UN equipo: lock por fila + idempotente. Resuelve TODAS sus alertas
 * abiertas en la misma transacción — si no, `device_offline` queda abierta
 * para siempre (su resolución exige last_seen >= cutoff, que un equipo dado
 * de baja nunca vuelve a cumplir) y una alerta crítica reabierta seguiría
 * notificando al cliente por un equipo que ya retiró.
 */
export class DecommissionDeviceUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: DecommissionDeviceInput): Promise<DeviceRow> {
    const reason = requireReason(input.reason);
    return this.unitOfWork.run(async (tx) => {
      const device = await tx.devices.findOwned(input.id, input.scope, true);
      if (!device) throw new DeviceNotFoundError();
      if (device.merged_into) throw new DeviceMergedError("Un registro fusionado no se puede dar de baja");
      if (device.decommissioned_at) return device; // idempotente

      await tx.devices.setDecommissioned([input.id], { by: input.userId, reason });
      const alertsResolved = await tx.devices.resolveOpenAlerts([input.id]);
      await tx.audit.write({
        action: "DEVICE_DECOMMISSIONED", targetId: String(input.id), clientId: device.client_id,
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: {
          serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
          agent_id: device.agent_id, client_id: device.client_id, last_seen: device.last_seen,
          total_pages: device.total_pages, reason, alerts_resolved: alertsResolved,
        },
      });
      return (await tx.devices.findOwned(input.id, input.scope)) as DeviceRow;
    });
  }
}

/** Reactivación — sin transacción ni lock, como el original. */
export class RecommissionDeviceUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: RecommissionDeviceInput): Promise<DeviceRow> {
    const device = await this.devices.findOwned(input.id, input.scope);
    if (!device) throw new DeviceNotFoundError();
    if (device.merged_into) throw new DeviceMergedError("Un registro fusionado no se puede reactivar");

    await this.devices.clearDecommissioned([input.id]);
    await this.audit.write({
      action: "DEVICE_RECOMMISSIONED", targetId: String(input.id), clientId: device.client_id,
      userId: input.userId, ipAddress: input.ipAddress, metadata: { reason: input.reason?.trim() || null },
    });
    return (await this.devices.findOwned(input.id, input.scope)) as DeviceRow;
  }
}
