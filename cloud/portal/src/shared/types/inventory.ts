export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomFieldDef {
  id: string;
  client_id: string | null;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  position: number;
  created_at: string;
}

export interface DeviceModel {
  id: string;
  brand: string;
  model_key: string;
  display_name: string | null;
  duty_cycle_monthly: number | null;
  recommended_volume_monthly: number | null;
  is_color: boolean | null;
  notes: string | null;
}
