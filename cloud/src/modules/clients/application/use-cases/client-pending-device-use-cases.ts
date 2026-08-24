import { ClientValidationError } from "../../domain/errors/client-error";
import type { DeviceRegistrationGateway } from "../ports/device-registration-gateway";
import type { PendingDevicesActionInput, PendingDevicesListInput } from "../dtos/client-dtos";

/** Cola de registro de dispositivos (Fase 7 del gap analysis vs HP SDS) — ver el puerto. */

export class ListPendingDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationGateway) {}
  execute(input: PendingDevicesListInput): Promise<unknown> {
    return this.registration.listPending({
      clientId: input.clientId,
      limit: input.limit ? Number(input.limit) : undefined,
      offset: input.offset ? Number(input.offset) : undefined,
      q: input.q,
      agentId: input.agentId,
    });
  }
}

function requireDeviceIds(deviceIds: string[] | undefined): string[] {
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) throw new ClientValidationError("deviceIds es requerido");
  return deviceIds;
}

export class RegisterPendingDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationGateway) {}
  execute(input: PendingDevicesActionInput): Promise<unknown> {
    const deviceIds = requireDeviceIds(input.deviceIds);
    return this.registration.register({ clientId: input.clientId, deviceIds, actorId: input.userId, ip: input.ipAddress });
  }
}

export class IgnorePendingDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationGateway) {}
  execute(input: PendingDevicesActionInput): Promise<unknown> {
    const deviceIds = requireDeviceIds(input.deviceIds);
    if (!input.reason?.trim()) throw new ClientValidationError("reason es requerido");
    return this.registration.ignore({
      clientId: input.clientId, deviceIds, reason: input.reason, actorId: input.userId, ip: input.ipAddress,
    });
  }
}
