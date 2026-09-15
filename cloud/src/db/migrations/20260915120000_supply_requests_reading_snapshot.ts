import type { Knex } from "knex";

/**
 * Snapshot de lectura al abrir un pedido de consumible — lo que le falta a
 * `supply_requests` para reproducir el "Historial de solicitudes de
 * consumibles" del modal de detalle del SDS (pedido de Ivan, 15/09/2026).
 *
 * El SDS muestra por solicitud: serie del cartucho, motivo, contadores
 * monocromático/color al momento del pedido, los deltas contra la solicitud
 * anterior y la fecha de reemplazo. De eso hoy sólo teníamos `level_pct` y
 * `remaining_days` (ver la migración 20260824110000): los contadores y la
 * serie del cartucho se perdían.
 *
 * Decisiones:
 * - Los deltas (Δ total / Δ color) NO se persisten: se derivan comparando
 *   contra la solicitud anterior del mismo (device_id, supply_key). Mismo
 *   criterio que `possible_duplicate_of`, que tampoco persiste.
 * - `reason` es sólo un CHECK de texto, no un enum de Postgres — mismo
 *   criterio que `status`/`origin` en la tabla original.
 * - Todas nullable: las filas históricas quedan en `null` y la UI muestra
 *   "—". Nada se rellena hacia atrás (no hay de dónde: `readings` crudo
 *   tiene los contadores, pero no la serie del cartucho de ese momento).
 * - `external_ref` es la "Referencia externa" del SDS (nº de orden del
 *   sistema de pedidos). La escribe quien crea/edita el pedido; no la
 *   inventa el worker.
 */
export async function up(knex: Knex): Promise<void> {
  const hasReason = await knex.schema.hasColumn("supply_requests", "reason");
  if (hasReason) return;

  await knex.schema.alterTable("supply_requests", (t) => {
    t.string("supply_serial", 120).nullable();
    t.string("external_ref", 120).nullable();
    t.text("reason").nullable();
    t.bigInteger("mono_pages").nullable();
    t.bigInteger("color_pages").nullable();
    t.bigInteger("total_pages").nullable();
    t.timestamp("replaced_at", { useTz: true }).nullable();
  });

  await knex.raw(`
    ALTER TABLE supply_requests
      ADD CONSTRAINT supply_requests_reason_check CHECK (
        reason IS NULL OR reason IN ('low_level','runtime','manual'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasReason = await knex.schema.hasColumn("supply_requests", "reason");
  if (!hasReason) return;

  await knex.raw("ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_reason_check");
  await knex.schema.alterTable("supply_requests", (t) => {
    t.dropColumn("supply_serial");
    t.dropColumn("external_ref");
    t.dropColumn("reason");
    t.dropColumn("mono_pages");
    t.dropColumn("color_pages");
    t.dropColumn("total_pages");
    t.dropColumn("replaced_at");
  });
}
