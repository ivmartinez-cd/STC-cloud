import type { PendingQueueResponse, PendingQueueSummary } from "../../domain/entities/pending-queue";
import type { DeviceRegistrationRepository, ListPendingQueueQuery } from "../../domain/repositories/device-registration-repository";
import { assertRegistrationIds } from "../../domain/services/device-rules";
import type { DeviceUnitOfWork } from "../ports/device-unit-of-work";
import { IgnoreDevicesUseCase, RegisterDevicesUseCase } from "./registration-use-cases";

/** Cola CROSS-cliente (handoff hifi "Dispositivos pendientes", 25/08/2026) — a
 * diferencia de `ListPendingDevicesUseCase` (scopeada a un cliente, Fase 7). */
export class ListPendingQueueUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository) {}
  execute(query: ListPendingQueueQuery): Promise<PendingQueueResponse> {
    return this.registration.listPendingQueue(query);
  }
}

export class GetPendingQueueSummaryUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository) {}
  execute(): Promise<PendingQueueSummary> {
    return this.registration.getPendingQueueSummary();
  }
}

type Skipped = Array<{ id: string; reason: string }>;

export interface PendingQueueActionInput {
  deviceIds: string[];
  actorId?: string | null;
  ip?: string | null;
}

/**
 * Agrupa por el `client_id` REAL de cada dispositivo (server-side — nunca se
 * confía en lo que el front cree que es el cliente sugerido) y delega en
 * `RegisterDevicesUseCase`/`IgnoreDevicesUseCase` UNA VEZ POR GRUPO: cero
 * lógica de auditoría/transición de estado duplicada, sólo reagrupa la
 * selección cross-cliente en llamadas client-scoped que esos casos de uso ya
 * saben resolver. `client_id === null` ("sin_cliente", ver docblock de
 * `PendingQueueRevision`) es un grupo más — `RegistrationActionInput.clientId`
 * acepta `null` desde este handoff justamente para este caso.
 */
async function groupByClient(registration: DeviceRegistrationRepository, deviceIds: string[]): Promise<Map<string | null, string[]>> {
  const rows = await registration.findRegistrationRows(deviceIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map<string | null, string[]>();
  for (const id of deviceIds) {
    const clientId = byId.get(id)?.client_id ?? null;
    const group = groups.get(clientId);
    if (group) group.push(id); else groups.set(clientId, [id]);
  }
  return groups;
}

export class ApprovePendingQueueUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository, private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: PendingQueueActionInput): Promise<{ approved: number; skipped: Skipped }> {
    assertRegistrationIds(input.deviceIds);
    const groups = await groupByClient(this.registration, input.deviceIds);
    const useCase = new RegisterDevicesUseCase(this.registration, this.unitOfWork);
    let approved = 0;
    const skipped: Skipped = [];
    for (const [clientId, deviceIds] of groups) {
      const result = await useCase.execute({ clientId, deviceIds, actorId: input.actorId, ip: input.ip });
      approved += result.registered;
      skipped.push(...result.skipped);
    }
    return { approved, skipped };
  }
}

export class IgnorePendingQueueUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository, private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: PendingQueueActionInput & { reason: string }): Promise<{ ignored: number; skipped: Skipped }> {
    assertRegistrationIds(input.deviceIds);
    const groups = await groupByClient(this.registration, input.deviceIds);
    const useCase = new IgnoreDevicesUseCase(this.registration, this.unitOfWork);
    let ignored = 0;
    const skipped: Skipped = [];
    for (const [clientId, deviceIds] of groups) {
      const result = await useCase.execute({ clientId, deviceIds, reason: input.reason, actorId: input.actorId, ip: input.ip });
      ignored += result.ignored;
      skipped.push(...result.skipped);
    }
    return { ignored, skipped };
  }
}
