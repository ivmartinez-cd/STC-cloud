import type { Knex } from "knex";
import { backfillAlertClassification } from "../../services/alertCatalog";

/**
 * Fase 3 del gap analysis vs HP SDS (docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md)
 * — diccionario de alertas. Hoy `alerts.type`/`alerts.message` llegan crudos desde
 * el vendor (`prtAlertCode` RFC 3805, bits `HR-<n>`, códigos Samsung EWS) sin
 * ninguna traducción — ver `alertService.synthesizeEwsAlertType`. Esta migración
 * agrega 3 columnas de METADATA DERIVADA (nunca clave de dedupe: `alerts.type`
 * sigue intacto y sigue siendo el conflict target de `alerts_device_type_open_uniq`/
 * `alerts_agent_type_open_uniq`) más `origin`, que distingue alertas que abrimos
 * nosotros mismos (`'cloud'`: toner_*, counter_reset, device_offline, agent_offline)
 * de las que reporta el equipo tal cual (`'device'`: EWS/SNMP crudo) — reemplaza la
 * blocklist `NON_EWS_RESERVED_TYPES` de `alertService.resolveStaleEwsAlerts`, que
 * no protegía `device_error`/`device_still_reporting` (bug real de auto-resolución
 * indebida: cualquier sync con alertas EWS los cerraba sin querer).
 *
 * El backfill de clasificación depende de código de app (`alertCatalog.ts`) desde
 * una migración — es intencional: la clasificación es metadata derivada, no
 * historia, así que un `knex migrate` corrido después en una base limpia usa el
 * catálogo ACTUAL, que es el comportamiento deseado (mejorar el diccionario más
 * adelante no debería requerir reescribir esta migración).
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Columnas + índices.
  const hasAlertClass = await knex.schema.hasColumn("alerts", "alert_class");
  if (!hasAlertClass) {
    await knex.schema.alterTable("alerts", (t) => {
      t.string("alert_class", 32).nullable();
      t.string("alert_reason", 120).nullable();
      t.string("responder", 24).nullable();
      t.string("origin", 16).notNullable().defaultTo("cloud"); // 'cloud' | 'device'
    });
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS alerts_class_open_idx ON alerts (alert_class) WHERE resolved = false`
    );
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS alerts_origin_open_idx ON alerts (device_id, origin) WHERE resolved = false`
    );
  }

  // 2. Unificar `device_error` (alertWorker.ts) → `device_offline`
  // (heartbeatMonitor.ts) — dos escritores para el mismo concepto hoy. Resolver
  // colisiones ANTES del rename: si el mismo device tiene las dos abiertas, el
  // `UPDATE type` de abajo violaría `alerts_device_type_open_uniq`.
  // IRREVERSIBLE a propósito — `down()` no lo deshace (no hay forma de saber cuál
  // fila era cuál después del merge).
  await knex.raw(`
    UPDATE alerts a SET resolved = true, resolved_at = now()
     WHERE a.type = 'device_error' AND a.resolved = false
       AND EXISTS (
         SELECT 1 FROM alerts b
          WHERE b.device_id = a.device_id AND b.type = 'device_offline' AND b.resolved = false
       )
  `);
  await knex.raw(`UPDATE alerts SET type = 'device_offline' WHERE type = 'device_error'`);

  // 3. Backfill de `origin`: tipos que escribimos nosotros mismos → 'cloud'
  // (default de la columna, no hace falta tocarlos); todo lo demás → 'device'.
  await knex.raw(`
    UPDATE alerts SET origin = 'device'
     WHERE origin = 'cloud'
       AND type NOT IN ('counter_reset','device_offline','agent_offline','device_still_reporting')
       AND type !~ '^toner_'
  `);

  // 4. Backfill de clasificación — sólo filas sin clasificar (`onlyNull: true`),
  // en lotes de 5000 (ver alertCatalog.ts).
  await backfillAlertClassification(knex, { onlyNull: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS alerts_origin_open_idx`);
  await knex.raw(`DROP INDEX IF EXISTS alerts_class_open_idx`);
  const hasAlertClass = await knex.schema.hasColumn("alerts", "alert_class");
  if (hasAlertClass) {
    await knex.schema.alterTable("alerts", (t) => {
      t.dropColumn("origin");
      t.dropColumn("responder");
      t.dropColumn("alert_reason");
      t.dropColumn("alert_class");
    });
  }
  // El rename device_error -> device_offline del paso 2 de `up()` NO se revierte
  // (irreversible, documentado arriba).
}
