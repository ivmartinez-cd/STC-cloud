import { DeviceConflictError, DeviceNotFoundError } from "../../domain/errors/device-error";
import type { DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { ScopedId, Actor } from "../dtos/device-dtos";

/**
 * `DELETE /devices/:id` — borrado en duro (lecturas + alertas + fila) en una
 * transacción. Rechazado (409) si tiene historial de facturación o es destino
 * de una fusión: para esos casos existe la baja (`decommission`).
 */
export class DeleteDeviceUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: ScopedId & Actor): Promise<{ success: true; message: string }> {
    await this.unitOfWork.run(async (tx) => {
      const device = await tx.devices.findOwned(input.id, input.scope);
      if (!device) throw new DeviceNotFoundError();
      if (await tx.devices.hasClosureLines(input.id)) {
        throw new DeviceConflictError("Tiene historial de facturación; dalo de baja en vez de eliminarlo");
      }
      if (await tx.devices.isMergeTarget(input.id)) {
        throw new DeviceConflictError("Es destino de una fusión; no se puede eliminar");
      }
      const deleted = await tx.devices.hardDelete(input.id);
      if (!deleted) throw new DeviceNotFoundError();
      await tx.audit.write({
        action: "DEVICE_DELETED", targetId: input.id, clientId: device.client_id,
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: {
          serial_number: device.serial_number, mac: device.mac, ip_address: device.ip_address,
          brand: device.brand, model: device.model, agent_id: device.agent_id, client_id: device.client_id,
          total_pages: device.total_pages,
        },
      });
    });
    return { success: true, message: "Dispositivo eliminado correctamente" };
  }
}
