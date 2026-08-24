import type { DeviceRow } from "../../domain/entities/device";
import { DeviceMergedError, DeviceNotFoundError, DeviceValidationError } from "../../domain/errors/device-error";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import { buildDeviceUpdates } from "../../domain/services/device-rules";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { CustomFieldMerger } from "../ports/custom-field-merger";
import type { UpdateDeviceInput } from "../dtos/device-dtos";

/** `PUT /devices/:id` — overrides manuales + `custom_data` (validado por `inventory`). Orden: 404 → 409 lápida → 400 body vacío. */
export class UpdateDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly customFields: CustomFieldMerger,
    private readonly audit: AuditLogWriter
  ) {}

  async execute(input: UpdateDeviceInput): Promise<DeviceRow> {
    const existing = await this.devices.findOwned(input.id, input.scope);
    if (!existing) throw new DeviceNotFoundError();
    if (existing.merged_into) throw new DeviceMergedError("No se puede editar un registro fusionado");

    const updates = buildDeviceUpdates(input.body);
    if (input.body.custom_data !== undefined) {
      // Puede lanzar `CustomFieldError` (con statusCode) — se propaga al controller.
      const merged = await this.customFields.validateAndMerge(existing.client_id as string, existing.custom_data, input.body.custom_data);
      updates.custom_data = JSON.stringify(merged);
    }
    if (Object.keys(updates).length === 0) throw new DeviceValidationError("Nada para actualizar");

    const updated = await this.devices.update(input.id, updates);
    await this.audit.write({
      action: "DEVICE_UPDATED", targetId: String(input.id), clientId: existing.client_id,
      userId: input.userId, ipAddress: input.ipAddress, metadata: { changes: Object.keys(updates) },
    });
    return updated;
  }
}
