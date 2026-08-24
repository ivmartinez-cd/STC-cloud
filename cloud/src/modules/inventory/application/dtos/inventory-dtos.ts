export interface CreateCustomFieldDefRequest {
  clientId: string;
  key: string;
  label: string;
  type: string;
  options?: unknown;
  position?: number;
  createdBy: string | null;
}

export interface UpdateCustomFieldDefRequest {
  label?: string;
  options?: unknown;
  position?: number;
}

export interface CreateDeviceModelRequest {
  brand: string;
  modelKey: string;
  displayName?: string;
  dutyCycleMonthly?: number;
  recommendedVolumeMonthly?: number;
  isColor?: boolean;
  notes?: string;
}

export interface UpdateDeviceModelRequest {
  displayName?: string | null;
  dutyCycleMonthly?: number | null;
  recommendedVolumeMonthly?: number | null;
  isColor?: boolean | null;
  notes?: string | null;
}
