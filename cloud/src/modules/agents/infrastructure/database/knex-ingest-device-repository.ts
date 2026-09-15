import type { Knex } from "knex";
import type { InsertedReadingRow, MappedReading } from "../../domain/entities/agent";
import type { IngestDeviceRepository } from "../../domain/repositories/ingest-device-repository";

export class KnexIngestDeviceRepository implements IngestDeviceRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async findLegacyByAgent(agentId: string, ip: string, serialToUse: string | null): Promise<any | null> {
    return (await this.db("devices").where({ agent_id: agentId }).whereNull("merged_into")
      .andWhere((builder) => {
        if (ip) builder.where("ip_address", ip);
        if (serialToUse) builder.orWhere("serial_number", serialToUse);
      }).first()) ?? null;
  }

  async findLegacyIdsByAgentIp(agentId: string, ip: string): Promise<string[]> {
    const rows = await this.db("devices").where({ agent_id: agentId, ip_address: ip }).whereNull("merged_into").select("id");
    return rows.map((r: { id: string }) => r.id);
  }

  async update(deviceId: string, updates: Record<string, unknown>): Promise<void> {
    await this.db("devices").where("id", deviceId).update(updates);
  }

  /**
   * `devices.mac` es `MACADDR`, no texto: `lower(mac)` revienta en runtime con
   * "function lower(macaddr) does not exist" (42883, misma familia que el
   * `MIN/MAX(uuid)`). Compila, pasa los tests que no tocan la base, y falla
   * recién contra Postgres. Hay que castear a texto.
   *
   * No era cosmético: esta consulta corre en `syncNetworkBoardAlert` para toda
   * lectura que traiga MAC, y al tirar excepción se cae el `execute()` entero
   * de `process-reading`, que hace `return null` y DESCARTA la lectura. El
   * equipo se seguía actualizando (el update va antes), así que el portal se
   * veía bien mientras el histórico perdía justo las lecturas del barrido de
   * discovery — las que traen MAC y consumibles. Medido en producción el
   * 15/09/2026: 2.914 fallos en 36 h sobre 137 equipos de los dos clientes.
   */
  async countOtherLiveDevicesWithMac(clientId: string, mac: string, excludeDeviceId: string): Promise<number> {
    const row = await this.db("devices").where("client_id", clientId).whereRaw("lower(mac::text) = lower(?)", [mac])
      .whereNot("id", excludeDeviceId).whereNull("decommissioned_at").whereNull("merged_into")
      .count<{ count: string }[]>("id as count").first();
    return Number(row?.count ?? 0);
  }

  async insert(row: Record<string, unknown>): Promise<void> {
    await this.db("devices").insert(row);
  }

  ghostIdsByIp(agentId: string, deviceId: string, ip: string): Promise<string[]> {
    return this.db("devices").where({ agent_id: agentId, ip_address: ip }).whereNot("id", deviceId).whereNull("merged_into")
      .andWhere((b) => b.whereNull("serial_number").orWhere("serial_number", ip)).pluck("id");
  }

  async existingIds(deviceIds: string[]): Promise<Set<string>> {
    const ids = await this.db("devices").whereIn("id", deviceIds).pluck("id");
    return new Set(ids.map(String));
  }

  insertReadings(rows: MappedReading[]): Promise<InsertedReadingRow[]> {
    return this.db("readings").insert(rows).onConflict(["reading_id", "time"]).ignore()
      .returning(["reading_id", "device_id", "time", "total_pages", "mono_pages", "color_pages"]);
  }
}
