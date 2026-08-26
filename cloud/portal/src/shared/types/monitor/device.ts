import type { SuppliesDetails } from './supplies';

export interface Device {
  id: string;
  agent_id?: string | null;
  active?: boolean;
  name: string;
  ip_address: string;
  serial_number: string | null;
  last_seen: string | null;
  model: string | null;
  total_pages: number | null;
  mono_pages: number | null;
  color_pages: number | null;
  brand: string | null;
  firmware?: string | null;
  mac?: string | null;
  hostname?: string | null;
  location?: string | null;
  sku?: string | null;
  poll_method?: string | null;
  created_at?: string | null;
  toner_black?: number | null;
  toner_cyan?: number | null;
  toner_magenta?: number | null;
  toner_yellow?: number | null;
  monthly_pages?: number | null;
  monthly_mono?: number | null;
  monthly_color?: number | null;
  supplies_details?: SuppliesDetails | string | null;
  // Cartridge identity (from EWS)
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
  // Identidad por cliente + ciclo de vida (§2.4 del gap analysis).
  client_id?:             string | null;
  name_override?:         string | null;
  location_override?:     string | null;
  decommissioned_at?:     string | null;
  decommissioned_by?:     string | null;
  decommission_reason?:   string | null;
  merged_into?:           string | null;
  merged_into_serial?:    string | null;
  merged_at?:             string | null;
  // Inventario manual/derivado (Fase 4 del gap analysis vs HP SDS).
  asset_number?:                  string | null;
  asset_number_reported?:         string | null;
  asset_number_override?:         string | null;
  asset_tag?:                     string | null;
  duty_cycle_monthly_override?:   number | null;
  duty_cycle_effective?:          number | null;
  utilization_pct?:               number | null;
  pages_30d?:                     number | null;
  mono_30d?:                      number | null;
  color_30d?:                     number | null;
  custom_data?:                   Record<string, unknown> | string | null;
  // Estado de monitoreo granular (Fase 5 del gap analysis vs HP SDS).
  monitor_state?:                 'full' | 'supplies_only' | 'reports_only' | 'disabled';
  monitor_state_changed_at?:      string | null;
  monitor_state_changed_by?:      string | null;
  monitor_state_reason?:          string | null;
  // Detección de consumible no original (Fase 10 del gap analysis vs HP SDS).
  supply_origin?:                 'genuine' | 'non_genuine' | null;
  supply_origin_at?:              string | null;
}
