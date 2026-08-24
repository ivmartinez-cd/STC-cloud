import type { AgentRow, DeviceRow } from "../../domain/entities/device";
import { DeviceConflictError, DeviceMergedError, DeviceNotFoundError, DeviceValidationError } from "../../domain/errors/device-error";
import { requireReason } from "../../domain/services/device-rules";
import type { DeviceTransactionScope, DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { MoveDeviceInput } from "../dtos/device-dtos";

/**
 * Mover UN equipo a otro monitor. `client_id` se DERIVA del agente destino,
 * nunca del body: tocar uno y no el otro deja al equipo visible para dos
 * clientes a la vez. Las alertas abiertas se resuelven (cruzarían de tenant y
 * pueden contener datos del sitio anterior). Orden de chequeos preservado.
 */
export class MoveDeviceUseCase {
  constructor(private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: MoveDeviceInput): Promise<DeviceRow> {
    if (!input.agentId) throw new DeviceValidationError("agentId es requerido");
    const reason = requireReason(input.reason);
    const agentId = input.agentId;
    return this.unitOfWork.run(async (tx) => {
      const device = await tx.devices.findOwned(input.id, input.scope, true);
      if (!device) throw new DeviceNotFoundError();
      if (device.merged_into) throw new DeviceMergedError("Un registro fusionado no se puede mover");
      const targetAgent = await this.resolveTargetAgent(tx, input, device, agentId);

      const clientChanged = targetAgent.client_id !== device.client_id;
      if (clientChanged && !input.confirmClientChange) {
        throw new DeviceValidationError("Cambiar de cliente requiere confirmClientChange: true");
      }
      await this.assertNoSerialCollision(tx, device, targetAgent.client_id);

      await tx.devices.reassign([input.id], agentId, targetAgent.client_id);
      const alertsResolved = await tx.devices.resolveOpenAlerts([input.id]);
      // client_id = el DESTINO — es donde el equipo vive ahora, así que es
      // bajo ese cliente que el feed debe mostrar el movimiento.
      await tx.audit.write({
        action: "DEVICE_MOVED", targetId: String(input.id), clientId: targetAgent.client_id,
        userId: input.userId, ipAddress: input.ipAddress,
        metadata: {
          from_agent_id: device.agent_id, to_agent_id: agentId,
          from_client_id: device.client_id, to_client_id: targetAgent.client_id,
          client_changed: clientChanged, reason, alerts_resolved: alertsResolved,
        },
      });
      return (await tx.devices.findOwned(input.id, { kind: "all" })) as DeviceRow;
    });
  }

  private async resolveTargetAgent(tx: DeviceTransactionScope, input: MoveDeviceInput, device: DeviceRow, agentId: string): Promise<AgentRow> {
    const targetAgent = await tx.devices.findAgent(agentId);
    if (!targetAgent || targetAgent.status === "revoked") throw new DeviceNotFoundError("Monitor destino no encontrado");
    if (input.scope.kind === "client" && targetAgent.client_id !== input.scope.id) {
      throw new DeviceNotFoundError("Monitor destino no encontrado");
    }
    if (agentId === device.agent_id) throw new DeviceValidationError("El equipo ya pertenece a ese monitor");
    return targetAgent;
  }

  private async assertNoSerialCollision(tx: DeviceTransactionScope, device: DeviceRow, targetClientId: string): Promise<void> {
    if (!device.serial_number) return;
    const collision = await tx.devices.findSerialCollision(targetClientId, device.serial_number, device.id);
    if (collision) {
      throw new DeviceConflictError("Ya existe este equipo en el cliente destino — usá Fusionar", { collisionId: collision.id });
    }
  }
}
