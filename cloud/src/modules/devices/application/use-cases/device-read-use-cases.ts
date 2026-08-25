import type { DeviceRow } from "../../domain/entities/device";
import { DeviceNotFoundError, DeviceValidationError } from "../../domain/errors/device-error";
import type { DeviceRepository } from "../../domain/repositories/device-repository";
import type { DeviceSuppliesReader } from "../ports/device-supplies-reader";
import type {
  DeviceReadingsInput, DeviceUsageHistoryInput, ListDevicesInput, ListDuplicatesInput, ScopedId,
} from "../dtos/device-dtos";

export class ListDevicesUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  execute(input: ListDevicesInput): Promise<{ items: DeviceRow[]; total: number }> {
    const includeDecommissioned = input.include === "decommissioned" || input.include === "all";
    return this.devices.list({
      scope: input.scope, includeDecommissioned, q: input.q, limit: input.limit, offset: input.offset,
    });
  }
}

/** Sin filtro de ciclo de vida a propósito: la ficha de un equipo dado de baja o fusionado tiene que seguir abriendo. */
export class GetDeviceUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  async execute(input: ScopedId): Promise<DeviceRow> {
    const device = await this.devices.getDetail(input.id, input.scope);
    if (!device) throw new DeviceNotFoundError();
    return device;
  }
}

/** Historial de lecturas — también consultable para equipos de baja/fusionados (es justo lo que la baja protege). */
export class GetDeviceReadingsUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  async execute(input: DeviceReadingsInput): Promise<unknown[]> {
    const id = await this.devices.resolveId(input.id, input.scope, true);
    if (!id) throw new DeviceNotFoundError();
    return this.devices.readings(id, { from: input.from, to: input.to, limit: input.limit });
  }
}

/** Fase 8 — consumibles calculados del lado servidor (única implementación en `suppliesService`). */
export class GetDeviceSuppliesUseCase {
  constructor(private readonly devices: DeviceRepository, private readonly supplies: DeviceSuppliesReader) {}
  async execute(input: ScopedId): Promise<unknown> {
    const id = await this.devices.resolveId(input.id, input.scope, true);
    if (!id) throw new DeviceNotFoundError();
    const result = await this.supplies.read(id);
    if (!result) throw new DeviceNotFoundError();
    return result;
  }
}

/**
 * Historial desde los agregados continuos (`readings_daily_agg`/`readings_monthly_agg`)
 * — sólo visualización, no deltas validados contra counter_reset (eso es
 * `reports`). No es de lectura inmediata: aparece con el próximo refresh.
 */
export class GetDeviceUsageHistoryUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  async execute(input: DeviceUsageHistoryInput): Promise<unknown[]> {
    const id = await this.devices.resolveId(input.id, input.scope, false);
    if (!id) throw new DeviceNotFoundError();
    return this.devices.usageHistory(id, { granularity: input.granularity, limit: input.limit });
  }
}

/** Pares vivos del mismo cliente por MAC, IP-fantasma en la misma sede, serial entre monitores o hostname. */
export class ListDuplicatesUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  execute(input: ListDuplicatesInput): Promise<unknown[]> {
    const effectiveClientId = input.scope.kind === "client" ? input.scope.id : input.clientId;
    if (!effectiveClientId) throw new DeviceValidationError("client_id es requerido");
    return this.devices.duplicates(effectiveClientId, input.agentId);
  }
}
