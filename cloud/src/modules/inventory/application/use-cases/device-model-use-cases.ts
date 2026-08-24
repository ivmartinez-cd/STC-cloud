import type { DeviceModel } from "../../domain/entities/device-model";
import { CustomFieldError } from "../../domain/errors/custom-field-error";
import type {
  DeviceModelRepository,
  ListDeviceModelsFilter,
} from "../../domain/repositories/device-model-repository";
import type { CreateDeviceModelRequest, UpdateDeviceModelRequest } from "../dtos/inventory-dtos";

export class ListDeviceModelsUseCase {
  constructor(private readonly repo: DeviceModelRepository) {}
  execute(filter: ListDeviceModelsFilter): Promise<DeviceModel[]> {
    return this.repo.list(filter);
  }
}

export class CreateDeviceModelUseCase {
  constructor(private readonly repo: DeviceModelRepository) {}

  execute(request: CreateDeviceModelRequest): Promise<DeviceModel> {
    if (!request.brand.trim() || !request.modelKey.trim()) {
      throw new CustomFieldError("brand y model_key son requeridos");
    }
    return this.repo.create({
      brand: request.brand.trim(),
      modelKey: request.modelKey.trim().toLowerCase(),
      displayName: request.displayName?.trim() || null,
      dutyCycleMonthly: request.dutyCycleMonthly ?? null,
      recommendedVolumeMonthly: request.recommendedVolumeMonthly ?? null,
      isColor: request.isColor ?? null,
      notes: request.notes?.trim() || null,
    });
  }
}

export class UpdateDeviceModelUseCase {
  constructor(private readonly repo: DeviceModelRepository) {}

  execute(id: string, request: UpdateDeviceModelRequest): Promise<DeviceModel | null> {
    const columns: UpdateDeviceModelRequest = {};
    if (request.dutyCycleMonthly !== undefined) columns.dutyCycleMonthly = request.dutyCycleMonthly;
    if (request.recommendedVolumeMonthly !== undefined) columns.recommendedVolumeMonthly = request.recommendedVolumeMonthly;
    if (request.isColor !== undefined) columns.isColor = request.isColor;
    if (request.notes !== undefined) columns.notes = request.notes?.trim() || null;
    if (request.displayName !== undefined) columns.displayName = request.displayName?.trim() || null;

    return this.repo.update(id, columns);
  }
}
