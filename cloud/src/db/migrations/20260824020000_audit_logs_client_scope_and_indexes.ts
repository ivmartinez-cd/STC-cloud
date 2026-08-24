import type { Knex } from "knex";

/**
 * Fase 3 del gap analysis vs HP SDS (docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md)
 * — feed de "Movimientos y cambios" sobre `audit_logs`. La decisión de retención
 * del 23/08 (`retentionJob.ts`) dejó `audit_logs` deliberadamente write-only
 * ("es un trail de auditoría write-only, sin ningún endpoint que lo lea") — ese
 * argumento era sobre RETENCIÓN (no purgarlo sin más), no sobre visibilidad. Esta
 * migración agrega scoping por cliente + índices para exponerlo por primera vez
 * vía `GET /audit-logs` (sólo lectura, ver `auditController.ts`) — la
 * inmutabilidad se preserva intacta: cero UPDATE/DELETE nuevos, `retentionJob.ts`
 * sigue sin tocar esta tabla.
 *
 * `target_id` es `varchar(100)` heterogéneo (ids de device/agent/client, a veces
 * un `agent_id` bajo una acción "DEVICES_BULK_*", a veces texto libre) — el
 * backfill de `client_id` sólo puede adivinar cuando `target_id` tiene forma de
 * UUID, probando contra las 3 tablas candidatas en orden (devices primero, es la
 * mayoría de las filas). Filas que no matchean ninguna quedan `client_id IS NULL`
 * — el feed las sigue mostrando (filtrables por acción/fecha/target), sólo no
 * aparecen si se filtra por cliente. `metadata->>'client_id'` tiene prioridad
 * sobre el backfill por tabla cuando existe (más específico, ya fue puesto ahí
 * por el propio código en el momento del evento).
 */
export async function up(knex: Knex): Promise<void> {
  const hasClientId = await knex.schema.hasColumn("audit_logs", "client_id");
  if (!hasClientId) {
    await knex.schema.alterTable("audit_logs", (t) => {
      t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("SET NULL");
    });
  }

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx ON audit_logs (action, created_at DESC)`
  );
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS audit_logs_client_created_at_idx ON audit_logs (client_id, created_at DESC)`
  );
  await knex.raw(`CREATE INDEX IF NOT EXISTS audit_logs_target_id_idx ON audit_logs (target_id)`);

  const UUID_RX = `'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;

  // 1. Prioridad: metadata->>'client_id' explícito (algunos call-sites ya lo
  // guardaban ahí antes de que existiera la columna).
  // jsonb_exists(metadata,'client_id') en vez del operador `?` — knex.raw()
  // trata `?` como SU PROPIO placeholder de binding (no hay forma de escaparlo
  // limpiamente sin pasar bindings), y esta migración rompía el arranque del
  // contenedor con "syntax error at or near $1" (confirmado contra el stack
  // real: knex ejecuta cada migración en una transacción, así que el fallo
  // hizo rollback limpio sin dejar estado a medias — pero el proceso quedaba
  // en crash-loop reintentando en cada boot).
  // FROM clients c ... c.id = (metadata->>'client_id')::uuid en vez de un UPDATE
  // directo con el cast: filas de test/histórico pueden referenciar un
  // client_id huérfano (cliente borrado desde entonces) — un UPDATE ciego
  // violaba `audit_logs_client_id_foreign` y tumbaba el arranque. El join
  // contra `clients` real sólo asigna cuando el cliente todavía existe; el
  // resto queda NULL y cae en los pasos 2-4 (por target_id) o directamente
  // sin cliente asignado.
  await knex.raw(`
    UPDATE audit_logs a SET client_id = c.id
      FROM clients c
     WHERE a.client_id IS NULL
       AND jsonb_exists(a.metadata, 'client_id')
       AND (a.metadata->>'client_id') ~* ${UUID_RX}
       AND c.id = (a.metadata->>'client_id')::uuid
  `);

  // 2. target_id como device.id
  await knex.raw(`
    UPDATE audit_logs a SET client_id = d.client_id
      FROM devices d
     WHERE a.client_id IS NULL AND a.target_id ~* ${UUID_RX}
       AND d.id = a.target_id::uuid
  `);

  // 3. target_id como agent.id (agentes creados/revocados, o
  // DEVICES_BULK_DECOMMISSIONED que usa target_id = agent_id)
  await knex.raw(`
    UPDATE audit_logs a SET client_id = g.client_id
      FROM agents g
     WHERE a.client_id IS NULL AND a.target_id ~* ${UUID_RX}
       AND g.id = a.target_id::uuid
  `);

  // 4. target_id como client.id directo (CLIENT_CREATED/CLIENT_UPDATED)
  await knex.raw(`
    UPDATE audit_logs a SET client_id = c.id
      FROM clients c
     WHERE a.client_id IS NULL AND a.target_id ~* ${UUID_RX}
       AND c.id = a.target_id::uuid
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS audit_logs_target_id_idx`);
  await knex.raw(`DROP INDEX IF EXISTS audit_logs_client_created_at_idx`);
  await knex.raw(`DROP INDEX IF EXISTS audit_logs_action_created_at_idx`);
  const hasClientId = await knex.schema.hasColumn("audit_logs", "client_id");
  if (hasClientId) {
    await knex.schema.alterTable("audit_logs", (t) => {
      t.dropColumn("client_id");
    });
  }
}
