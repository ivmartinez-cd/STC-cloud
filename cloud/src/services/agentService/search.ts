import type { Knex } from "knex";

/** Buscador global (clientes + dispositivos) usado por el buscador del portal. */
export class AgentSearchService {
  constructor(private db: Knex) {}

  /**
   * @param clientId - si viene (client_viewer), acota clientes y equipos al cliente
   *   del usuario. `null` = sin restricción (admin/operator, comportamiento actual).
   */
  async globalSearch(query: string, clientId: string | null = null) {
    const q = `%${query}%`;

    const [clients, devices] = await Promise.all([
      this.db("clients")
        .where("name", "ILIKE", q)
        .modify((b) => { if (clientId) b.andWhere("id", clientId); })
        .select("id", "name")
        .limit(5),
      this.db("devices")
        // Agrupado en un `.where(builder => ...)`: la versión anterior encadenaba
        // `.where(A).orWhere(B).orWhere(C).orWhere(D)` sin agrupar, así que CUALQUIER
        // `.where(client_id, cid)` agregado después de este bloque quedaba anulado por
        // precedencia de OR (`A OR B OR C OR (D AND client_id=cid)`) — una fuga entre
        // clientes que además parecía funcionar en pruebas manuales por serial exacto.
        .where((b) => {
          b.where("serial_number", "ILIKE", q)
            .orWhere("brand", "ILIKE", q)
            .orWhere("model", "ILIKE", q)
            .orWhere("name", "ILIKE", q);
        })
        // Una lápida de fusión en el buscador lleva a un detalle con 0 lecturas
        // propias y parece pérdida de datos -> se excluye siempre. Las bajas SÍ
        // se incluyen (hay que poder encontrar por serial un equipo a
        // reactivar), devolviendo `decommissioned_at` para que el portal las
        // pinte distinto.
        .whereNull("devices.merged_into")
        .modify((b) => {
          if (clientId) b.andWhere("devices.client_id", clientId);
        })
        .select(
          "devices.id", "devices.serial_number", "devices.brand", "devices.model", "devices.name",
          "devices.decommissioned_at"
        )
        .limit(5),
    ]);

    return { clients, devices };
  }
}
