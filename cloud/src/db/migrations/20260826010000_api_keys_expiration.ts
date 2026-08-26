import type { Knex } from "knex";

/**
 * Expiración automática de API keys (Fase 2 del gap analysis vs HP SDS —
 * "Lo que NO se hizo" de la API pública, pendiente desde el 23/08/2026).
 * Opcional: `NULL` = sin vencimiento (comportamiento de siempre, cero
 * cambio para las keys ya emitidas). Se enforcea en `resolveApiKey()`, no
 * con un job que las revoque — una key vencida simplemente deja de
 * autenticar, no hace falta tocar la fila.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_keys", (t) => {
    t.timestamp("expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_keys", (t) => {
    t.dropColumn("expires_at");
  });
}
