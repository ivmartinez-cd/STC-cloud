import type { InsertedReadingRow, MappedReading } from "../entities/agent";

/**
 * Filas de `devices`/`readings` que toca la INGESTA (registro desde el agente
 * y sync de lecturas). Deliberadamente separado de `modules/devices`: el
 * ciclo de vida del portal es otro contexto; acá sólo el camino caliente del
 * agente. Las queries son las mismas de `sync-reading.ts`/`device-registration.ts`.
 */
export interface IngestDeviceRepository {
  /** Fallback para agente huérfano (sin client_id): matcher legacy por agente. */
  findLegacyByAgent(agentId: string, ip: string, serialToUse: string | null): Promise<any | null>;
  findLegacyIdsByAgentIp(agentId: string, ip: string): Promise<string[]>;
  update(deviceId: string, updates: Record<string, unknown>): Promise<void>;
  insert(row: Record<string, unknown>): Promise<void>;
  /** Fantasmas duplicados en la misma IP/agente (sin serial o serial = IP), excluyendo `deviceId`. */
  ghostIdsByIp(agentId: string, deviceId: string, ip: string): Promise<string[]>;
  existingIds(deviceIds: string[]): Promise<Set<string>>;
  /** Cuántos OTROS equipos vivos del cliente reportan la misma MAC (ver `isPlaceholderMac`). */
  countOtherLiveDevicesWithMac(clientId: string, mac: string, excludeDeviceId: string): Promise<number>;
  /** `ON CONFLICT (reading_id, time) DO NOTHING` — idempotencia ante reintentos del agente. */
  insertReadings(rows: MappedReading[]): Promise<InsertedReadingRow[]>;
}
