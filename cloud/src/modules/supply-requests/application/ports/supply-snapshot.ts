/** Puerto: estado actual de consumibles de la flota de un cliente. */
export interface SupplyLevelRow {
  deviceId: string;
  deviceSerial: string | null;
  deviceLabel: string | null;
  supplyKey: string;
  supplyKind: string;
  supplyColor: string | null;
  description: string | null;
  sku: string | null;
  percentage: number | null;
  remainingDays: number | null;
}

export interface SupplySnapshot {
  /** Consumibles bajo el umbral (candidatos a pedido) del cliente. */
  belowThreshold(clientId: string, thresholdPct: number): Promise<SupplyLevelRow[]>;
  /** Nivel actual de un consumible puntual (para auto-completado). null si no hay lectura. */
  currentLevel(deviceId: string, supplyKey: string): Promise<number | null>;
}

export interface EnabledClient {
  id: string;
  thresholdPct: number;
}

export interface EnabledClientsSource {
  listEnabled(): Promise<EnabledClient[]>;
}
