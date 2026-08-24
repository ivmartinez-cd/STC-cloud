import type { Knex } from "knex";

/**
 * Fase 4.3 del gap analysis vs HP SDS (re-comparación 24/08/2026):
 * plantillas de mensajes editables + notificaciones por evento con opt-out
 * por cliente — el equivalente de "Plantillas de mensajes" y
 * "Configuraciones de notificación" del SDS.
 *
 * - `message_templates`: subject/body con placeholders `{{var}}` por evento,
 *   `client_id` NULL = plantilla global; una fila por cliente overridea la
 *   global para ese evento (misma precedencia que `incident_rules`). Si no
 *   hay fila, se usa el texto hardcodeado actual de `notificationService`
 *   como default — cero cambio de comportamiento al desplegar.
 * - `clients.notification_events`: qué eventos le llegan al cliente por
 *   email/webhook propio (default: todos — comportamiento actual). No toca
 *   los webhooks de la API pública, que ya tienen su propio array `events`.
 * - El upsert de plantillas se hace con SELECT-then-INSERT/UPDATE explícito
 *   (no `.onConflict()` sobre el índice de expresión) — mismo criterio ya
 *   documentado en `incidentService.upsertIncidentRule`.
 */
export async function up(knex: Knex): Promise<void> {
  const hasEvents = await knex.schema.hasColumn("clients", "notification_events");
  if (!hasEvents) {
    await knex.schema.alterTable("clients", (t) => {
      t.jsonb("notification_events")
        .notNullable()
        .defaultTo(JSON.stringify([
          "alert.created", "incident.created",
          "supply_request.created", "supply_request.completed", "report.closed",
        ]));
    });
  }

  const hasTable = await knex.schema.hasTable("message_templates");
  if (hasTable) return;

  await knex.schema.createTable("message_templates", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
    t.text("event").notNullable();
    t.string("subject", 200).notNullable();
    t.text("body").notNullable();
    t.uuid("updated_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE message_templates
      ADD CONSTRAINT message_templates_event_check CHECK (event IN
        ('alert.created','incident.created','supply_request.created',
         'supply_request.completed','report.closed'))
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX message_templates_scope_event_uniq
      ON message_templates (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), event)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("message_templates");
  const hasEvents = await knex.schema.hasColumn("clients", "notification_events");
  if (hasEvents) {
    await knex.schema.alterTable("clients", (t) => {
      t.dropColumn("notification_events");
    });
  }
}
