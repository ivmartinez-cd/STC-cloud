export interface SuppliesItem {
  percentage?: number | null;
  status?: string | null;
  code?: string | null;
  orderNumber?: string | null;
  serial?: string | null;
  capacity?: number | null;
  printed?: number | null;
  remainingPages?: number | null;
  remainingDays?: number | null;
  firstInstallDate?: string | null;
  lastUseDate?: string | null;
}

export interface SuppliesDetails {
  toners?: Partial<Record<"black" | "cyan" | "magenta" | "yellow", SuppliesItem>>;
  drums?: Partial<Record<"black" | "cyan" | "magenta" | "yellow", SuppliesItem>>;
  maintenance?: Partial<Record<
    "fuser" | "transferBelt" | "transferRoller" | "tray1Roller" | "tray1RetardRoller" |
    "mpTrayRoller" | "mpTrayRetardRoller" | "wasteToner", SuppliesItem
  >> & { other?: Array<{ name: string; percentage?: number | null; status?: string | null; maxCapacity?: number | null }> };
}

export type SupplyKind = "Tóner" | "Tambor de imagen" | "Fusor" | "Rodillo" | "Banda de transferencia" | "Depósito de residuos" | "Kit de mantenimiento" | "Otro";
export type SupplyColor = "Negro" | "Cian" | "Magenta" | "Amarillo" | "Sin color";

export interface SupplyRow {
  key: string;
  description: string;
  kind: SupplyKind;
  color: SupplyColor;
  colorClass: string;
  percentage: number | null;
  status: string | null;
  code: string | null;
  orderNumber: string | null;
  serial: string | null;
  capacity: number | null;
  printed: number | null;
  remainingPages: number | null;
  remainingDays: number | null;
  firstInstallDate: string | null;
  lastUseDate: string | null;
}

export interface FleetSupplyRow extends SupplyRow {
  device_id: string;
  device_serial: string | null;
  device_model: string | null;
  device_brand: string | null;
  client_id: string | null;
  client_name: string | null;
  agent_name: string | null;
  last_seen: string | null;
}

export interface UsageRate {
  totalPerDay: number | null;
  colorPerDay: number | null;
  monoPerDay: number | null;
  spanDays: number | null;
}

export const EMPTY_RATE: UsageRate = { totalPerDay: null, colorPerDay: null, monoPerDay: null, spanDays: null };
