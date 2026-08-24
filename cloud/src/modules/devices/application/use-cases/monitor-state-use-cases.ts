import type { DeviceRow } from "../../domain/entities/device";
import { DeviceNotFoundError, DeviceValidationError, MonitorStateError } from "../../domain/errors/device-error";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import { assertBulkIds, assertMonitorState } from "../../domain/services/device-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { BulkMonitorStateInput, ScopedMonitorStateInput, SetMonitorStateInput } from "../dtos/device-dtos";

/**
 * Punto único para cambiar `devices.monitor_state` (Fase 5) — reusado por el
 * endpoint single y por la acción en bloque, para que los dos caminos no
 * diverjan. `null` si el equipo no existe (comportamiento histórico).
 */
export class SetMonitorStateUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: SetMonitorStateInput): Promise<DeviceRow | null> {
    assertMonitorState(input.state);
    const device = await this.devices.findOwned(input.deviceId, { kind: "all" });
    if (!device) return null;
    if (device.merged_into) throw new MonitorStateError("No se puede cambiar el estado de monitoreo de un registro fusionado", 409);

    const reason = input.reason?.trim() || null;
    const updated = await this.devices.setMonitorState(input.deviceId, input.state, input.userId, reason);
    await this.audit.write({
      action: "DEVICE_MONITOR_STATE_CHANGED", targetId: input.deviceId, clientId: device.client_id,
      userId: input.userId, ipAddress: input.ipAddress, metadata: { from: device.monitor_state, to: input.state, reason },
    });
    return updated;
  }
}

/** `PUT /devices/:id/monitor-state` — chequeo de propiedad por scope antes de delegar en la primitiva. */
export class UpdateMonitorStateUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly setState: SetMonitorStateUseCase) {}

  async execute(input: ScopedMonitorStateInput): Promise<DeviceRow> {
    if (!input.state) throw new DeviceValidationError("state es requerido");
    if (!(await this.devices.findOwned(input.id, input.scope))) throw new DeviceNotFoundError();
    const updated = await this.setState.execute({
      deviceId: input.id, state: input.state, reason: input.reason, userId: input.userId, ipAddress: input.ipAddress,
    });
    if (!updated) throw new DeviceNotFoundError();
    return updated;
  }
}

/**
 * `POST /devices/bulk/monitor-state`. `state` inválido es el MISMO para todos
 * los ids — recién puede fallar en la primera iteración (antes de mutar
 * nada), así que abortar con 400 ahí es seguro. "Fusionado" (409) SÍ es
 * por-dispositivo — no aborta el resto del lote.
 */
export class BulkSetMonitorStateUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly setState: SetMonitorStateUseCase) {}

  async execute(input: BulkMonitorStateInput) {
    const ids = input.ids;
    assertBulkIds(ids);
    if (!input.state) throw new DeviceValidationError("state es requerido");
    const owned = await this.devices.findManyOwned(ids, input.scope);

    const applied: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of ids) {
      if (!owned.has(id)) { skipped.push({ id, reason: "not_found" }); continue; }
      const outcome = await this.applyOne(id, input);
      if (outcome === "applied") applied.push(id); else skipped.push({ id, reason: outcome });
    }
    return { count: applied.length, applied, skipped };
  }

  private async applyOne(id: string, input: BulkMonitorStateInput): Promise<"applied" | "not_found" | "merged"> {
    try {
      const updated = await this.setState.execute({
        deviceId: id, state: input.state as string, reason: input.reason, userId: input.userId, ipAddress: input.ipAddress,
      });
      return updated ? "applied" : "not_found";
    } catch (err) {
      if (err instanceof MonitorStateError && err.statusCode === 409) return "merged";
      throw err;
    }
  }
}
