import type { DeviceRow, PendingDeviceRow } from "../../domain/entities/device";
import { DeviceNotFoundError, DeviceRegistrationError } from "../../domain/errors/device-error";
import type { DeviceRegistrationRepository } from "../../domain/repositories/device-registration-repository";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import { assertRegistrationIds } from "../../domain/services/device-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { DeviceTransactionScope, DeviceUnitOfWork } from "../ports/device-unit-of-work";
import type { ListPendingInput, RegistrationActionInput, UnignoreDeviceInput, UnignoreInput } from "../dtos/device-dtos";

type Skipped = Array<{ id: string; reason: string }>;

/** Cola de "Dispositivos pendientes de registro" (Fase 7 del gap analysis vs HP SDS). */
export class ListPendingDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository) {}
  execute(input: ListPendingInput): Promise<{ items: PendingDeviceRow[]; total: number }> {
    return this.registration.listPending(input);
  }
}

/** Ids que no matchean (no existen, no son del cliente, o no están en el estado esperado) vuelven en `skipped`. */
async function classifyRegistration(
  registration: DeviceRegistrationRepository, input: RegistrationActionInput,
  isSkippable: (state: string) => string | null
): Promise<{ selected: string[]; skipped: Skipped }> {
  const rows = await registration.findRegistrationRows(input.deviceIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selected: string[] = [];
  const skipped: Skipped = [];
  for (const id of input.deviceIds) {
    const row = byId.get(id);
    if (!row || row.client_id !== input.clientId) { skipped.push({ id, reason: "not_found" }); continue; }
    const skipReason = isSkippable(row.registration_state);
    if (skipReason) { skipped.push({ id, reason: skipReason }); continue; }
    selected.push(id);
  }
  return { selected, skipped };
}

async function auditEach(tx: DeviceTransactionScope, ids: string[], action: string, input: RegistrationActionInput, metadata: Record<string, unknown>) {
  for (const id of ids) {
    await tx.audit.write({
      action, targetId: id, clientId: input.clientId, userId: input.actorId ?? null, ipAddress: input.ip ?? null, metadata,
    });
  }
}

/** Registra en bloque — `pending` → `registered`. */
export class RegisterDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository, private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: RegistrationActionInput): Promise<{ registered: number; skipped: Skipped }> {
    assertRegistrationIds(input.deviceIds);
    const { selected, skipped } = await classifyRegistration(this.registration, input, (s) => (s !== "pending" ? "not_pending" : null));
    if (selected.length > 0) {
      await this.unitOfWork.run(async (tx) => {
        await tx.registration.markRegistered(selected, input.actorId ?? null);
        await auditEach(tx, selected, "DEVICE_REGISTERED", input, {});
      });
    }
    return { registered: selected.length, skipped };
  }
}

/** Ignora en bloque — pasa a `ignored` (cualquier estado previo salvo ya-ignored). Corta la ingesta futura. */
export class IgnoreDevicesUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository, private readonly unitOfWork: DeviceUnitOfWork) {}

  async execute(input: RegistrationActionInput & { reason: string }): Promise<{ ignored: number; skipped: Skipped }> {
    assertRegistrationIds(input.deviceIds);
    if (!input.reason?.trim()) throw new DeviceRegistrationError("reason es requerido");
    const reason = input.reason.trim();
    const { selected, skipped } = await classifyRegistration(this.registration, input, (s) => (s === "ignored" ? "already_ignored" : null));
    if (selected.length > 0) {
      await this.unitOfWork.run(async (tx) => {
        await tx.registration.markIgnored(selected, input.actorId ?? null, reason);
        await auditEach(tx, selected, "DEVICE_IGNORED", input, { reason });
      });
    }
    return { ignored: selected.length, skipped };
  }
}

/** Vuelve un equipo `ignored` a `pending`. `null` si no existe (comportamiento histórico). */
export class UnignoreUseCase {
  constructor(private readonly registration: DeviceRegistrationRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: UnignoreInput): Promise<DeviceRow | null> {
    const device = await this.registration.findById(input.deviceId);
    if (!device) return null;
    if (device.registration_state !== "ignored") throw new DeviceRegistrationError("El equipo no está ignorado", 409);
    const updated = await this.registration.unignore(input.deviceId);
    await this.audit.write({
      action: "DEVICE_UNIGNORED", targetId: input.deviceId, clientId: device.client_id,
      userId: input.actorId ?? null, ipAddress: input.ip ?? null, metadata: { reason: input.reason?.trim() || null },
    });
    return updated;
  }
}

/** `POST /devices/:id/unignore` — chequeo de propiedad por scope antes de delegar. */
export class UnignoreDeviceRequestUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly unignore: UnignoreUseCase) {}

  async execute(input: UnignoreDeviceInput): Promise<DeviceRow> {
    if (!(await this.devices.findOwned(input.id, input.scope))) throw new DeviceNotFoundError();
    const updated = await this.unignore.execute({ deviceId: input.id, reason: input.reason, actorId: input.userId, ip: input.ipAddress });
    if (!updated) throw new DeviceNotFoundError();
    return updated;
  }
}
