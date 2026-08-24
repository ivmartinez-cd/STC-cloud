/**
 * Detalle de consumibles de un equipo (Fase 8) — única implementación en
 * `services/suppliesService` (compartida con la superficie de consumibles),
 * consumida acá por puerto. `null` si el equipo no existe.
 */
export interface DeviceSuppliesReader {
  read(deviceId: string): Promise<unknown | null>;
}
