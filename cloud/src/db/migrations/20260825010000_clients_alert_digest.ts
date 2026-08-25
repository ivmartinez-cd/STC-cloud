import type { Knex } from 'knex';

/**
 * Digest diario de alertas (pendiente explícito de la Fase 1 del gap
 * analysis vs HP SDS — "Alert loop", ⬜ digest diario no implementado).
 *
 * Opt-in reusando el mecanismo YA existente de `clients.notification_events`
 * (Fase 4.3) en vez de sumar un boolean paralelo: el cliente lo activa
 * agregando `"alert.digest"` a ese array, mismo lugar donde ya opta por
 * `alert.created`/`incident.created`/etc. No se agrega a los defaults de la
 * columna (`20260824120000`) — clientes existentes y nuevos quedan SIN
 * digest hasta que lo pidan explícitamente, es una feature nueva, no un
 * cambio de comportamiento.
 *
 * `last_alert_digest_sent_at` es la marca de idempotencia: `alertDigestJob.ts`
 * la usa para no reenviar dos veces el mismo día si el proceso reinicia
 * entre el envío y la próxima corrida del tick.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('clients', 'last_alert_digest_sent_at');
  if (!hasColumn) {
    await knex.schema.alterTable('clients', (t) => {
      t.timestamp('last_alert_digest_sent_at', { useTz: true }).nullable();
    });
  }

  // `alert.digest` es un evento nuevo en TEMPLATE_EVENTS — el CHECK de
  // `message_templates_event_check` (20260824120000) todavía no lo admite,
  // así que un cliente que quisiera personalizar el texto del digest
  // violaría la constraint al guardar. Se reemplaza por la lista completa.
  await knex.raw(`ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_event_check`);
  await knex.raw(`
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_event_check CHECK (event IN
        ('alert.created','incident.created','supply_request.created',
         'supply_request.completed','report.closed','alert.digest'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_event_check`);
  await knex.raw(`
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_event_check CHECK (event IN
        ('alert.created','incident.created','supply_request.created',
         'supply_request.completed','report.closed'))
  `);
  await knex.schema.alterTable('clients', (t) => {
    t.dropColumn('last_alert_digest_sent_at');
  });
}
