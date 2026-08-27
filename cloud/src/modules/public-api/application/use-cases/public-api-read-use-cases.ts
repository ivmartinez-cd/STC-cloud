import type { PageParams, PublicApiRepository } from "../../domain/repositories/public-api-repository";
import { NotFoundError } from "../../../../shared/domain/errors";

export class ListPublicDevicesUseCase {
  constructor(private readonly repo: PublicApiRepository) {}
  execute(clientId: string, page: PageParams) { return this.repo.listDevices(clientId, page); }
}

export class GetPublicDeviceReadingsUseCase {
  constructor(private readonly repo: PublicApiRepository) {}

  async execute(clientId: string, deviceId: string, filters: { from?: Date; to?: Date; limit: number }) {
    const owned = await this.repo.findOwnedDevice(clientId, deviceId);
    if (!owned) throw new NotFoundError("Dispositivo no encontrado");
    return this.repo.listDeviceReadings(deviceId, filters);
  }
}

export class ListPublicAlertsUseCase {
  constructor(private readonly repo: PublicApiRepository) {}
  execute(clientId: string, filters: { resolved?: boolean }, page: PageParams) {
    return this.repo.listAlerts(clientId, filters, page);
  }
}

export class ListPublicReportClosuresUseCase {
  constructor(private readonly repo: PublicApiRepository) {}
  execute(clientId: string, page: PageParams) { return this.repo.listReportClosures(clientId, page); }
}

/** Header + detalle por equipo — mismo patrón que `reportController.getClosure`. */
export class GetPublicReportClosureUseCase {
  constructor(private readonly repo: PublicApiRepository) {}

  async execute(clientId: string, closureId: string) {
    const closure = await this.repo.findReportClosure(clientId, closureId);
    if (!closure) throw new NotFoundError("Cierre no encontrado");
    const lines = await this.repo.listReportClosureLines(closureId);
    return { ...closure, lines };
  }
}
