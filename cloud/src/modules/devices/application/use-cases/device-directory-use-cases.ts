import type { DeviceScope } from "../../domain/entities/device";
import type { DeviceDirectoryResponse, DeviceDirectorySegment, DeviceDirectorySortField, DeviceInventorySummary, SortDir } from "../../domain/entities/device-directory";
import type { DeviceRepository } from "../../domain/repositories/device-repository";

export interface GetDeviceDirectoryInput {
  scope: DeviceScope;
  q?: string;
  segment?: DeviceDirectorySegment;
  sortField?: DeviceDirectorySortField;
  sortDir?: SortDir;
  include?: string;
  limit?: number;
  offset?: number;
}

/** Listado global agrupado por cliente (handoff hifi "Inventario de dispositivos",
 * 25/08/2026) — la agrupación server-side vive en el repo, ver `KnexDeviceRepository.listDirectory`. */
export class GetDeviceDirectoryUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  execute(input: GetDeviceDirectoryInput): Promise<DeviceDirectoryResponse> {
    const includeDecommissioned = input.include === "decommissioned" || input.include === "all";
    return this.devices.listDirectory({
      scope: input.scope, q: input.q, segment: input.segment, sortField: input.sortField, sortDir: input.sortDir,
      includeDecommissioned, limit: input.limit, offset: input.offset,
    });
  }
}

/** Tira de 5 métricas del header — endpoint aparte, mismo criterio que `GetClientPortfolioSummaryUseCase`. */
export class GetDeviceInventorySummaryUseCase {
  constructor(private readonly devices: DeviceRepository) {}
  execute(scope: DeviceScope): Promise<DeviceInventorySummary> {
    return this.devices.getInventorySummary(scope);
  }
}
