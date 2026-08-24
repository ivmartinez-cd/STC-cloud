import type { Knex } from "knex";

/**
 * Fase 4.4 del gap analysis vs HP SDS (re-comparación 24/08/2026):
 * auditoría de correo — el "Registro de auditoría de correo electrónico"
 * global del SDS (+ su pestaña Email Log por equipo). Cada intento de envío
 * que pasa por `notificationService.sendMail` deja una fila acá, incluso
 * cuando NO se envió (sin transporte SMTP o sin destinatario): "no se mandó
 * nada" también es una respuesta que el operador necesita poder auditar.
 *
 * La escritura es best-effort desde el único choke point de envío — un
 * fallo del log jamás frena la notificación (mismo criterio que
 * `resolveTemplate` en 4.3). Se purga a los 12 meses en `retentionJob.ts`,
 * mismo horizonte que las alertas resueltas.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("email_log");
  if (has) return;

  await knex.schema.createTable("email_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("SET NULL");
    t.text("event").notNullable().defaultTo("other");
    t.string("recipient", 500).nullable();
    t.string("subject", 300).notNullable();
    t.text("status").notNullable();
    t.text("error").nullable();
    t.jsonb("metadata").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE email_log
      ADD CONSTRAINT email_log_status_check CHECK (status IN
        ('sent','error','skipped_no_transport','skipped_no_recipient'))
  `);
  await knex.raw(`
    CREATE INDEX email_log_client_created_idx ON email_log (client_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX email_log_created_idx ON email_log (created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("email_log");
}
