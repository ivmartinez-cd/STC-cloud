import type { DeviceLowestSupply } from "../../domain/entities/device-detail";

/**
 * Detalle de consumibles de un equipo (Fase 8) — única implementación en
 * `services/suppliesService` (compartida con la superficie de consumibles),
 * consumida acá por puerto. `null` si el equipo no existe.
 */
export interface DeviceSuppliesReader {
  read(deviceId: string): Promise<unknown | null>;
  /** Detalle histórico de UN consumible (modal "Detalles del consumible"). `null` si no existe ese `supplyKey`. */
  history(deviceId: string, supplyKey: string): Promise<unknown | null>;
  /** Consumible con menor % restante, para la tira de métricas — `null` si ninguno reportó %. */
  lowest(deviceId: string): Promise<DeviceLowestSupply | null>;
}
