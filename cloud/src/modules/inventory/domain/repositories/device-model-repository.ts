import type { DeviceModel } from "../entities/device-model";

export interface ListDeviceModelsFilter {
  brand?: string;
  q?: string;
}

export interface CreateDeviceModelInput {
  brand: string;
  modelKey: string;
  displayName: string | null;
  dutyCycleMonthly: number | null;
  recommendedVolumeMonthly: number | null;
  isColor: boolean | null;
  notes: string | null;
}

export interface UpdateDeviceModelColumns {
  displayName?: string | null;
  dutyCycleMonthly?: number | null;
  recommendedVolumeMonthly?: number | null;
  isColor?: boolean | null;
  notes?: string | null;
}

export interface DeviceModelRepository {
  list(filter: ListDeviceModelsFilter): Promise<DeviceModel[]>;
  /** Lanza CustomFieldError(409) si ya existe brand/model_key (constraint única). */
  create(input: CreateDeviceModelInput): Promise<DeviceModel>;
  update(id: string, columns: UpdateDeviceModelColumns): Promise<DeviceModel | null>;
}
