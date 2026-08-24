import type { Knex } from "knex";
import type { GlobalSearchRepository } from "../../application/use-cases/search-use-case";

export class KnexGlobalSearchRepository implements GlobalSearchRepository {
  constructor(private readonly db: Knex) {}

  async search(query: string, clientId: string | null) {
    const q = `%${query}%`;
    const [clients, devices] = await Promise.all([
      this.db("clients").where("name", "ILIKE", q).modify((b) => { if (clientId) b.andWhere("id", clientId); }).select("id", "name").limit(5),
      this.db("devices")
        // Agrupado: sin el `.where(builder => ...)` un `client_id=cid` posterior
        // quedaba anulado por precedencia de OR — fuga entre clientes.
        .where((b) => {
          b.where("serial_number", "ILIKE", q).orWhere("brand", "ILIKE", q).orWhere("model", "ILIKE", q).orWhere("name", "ILIKE", q);
        })
        // Lápidas de fusión excluidas siempre; bajas SÍ (para poder reactivar por serial).
        .whereNull("devices.merged_into")
        .modify((b) => { if (clientId) b.andWhere("devices.client_id", clientId); })
        .select("devices.id", "devices.serial_number", "devices.brand", "devices.model", "devices.name", "devices.decommissioned_at")
        .limit(5),
    ]);
    return { clients, devices };
  }
}
