export interface DeviceModel {
  id: string;
  brand: string;
  modelKey: string;
  displayName: string | null;
  dutyCycleMonthly: number | null;
  recommendedVolumeMonthly: number | null;
  isColor: boolean | null;
  notes: string | null;
}
