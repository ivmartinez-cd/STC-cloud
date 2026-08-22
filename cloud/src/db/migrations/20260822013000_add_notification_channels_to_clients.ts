import type { Knex } from "knex";

/**
 * Canales de notificación por cliente. Sin fallback a `contact_email`: si un
 * cliente no configuró nada acá, no se le manda nada — evita mandarle mail al
 * contacto comercial de todos los clientes existentes el día que esto se
 * despliega (ver `notificationService.ts`).
 */
export async function up(knex: Knex): Promise<void> {
  const hasEmail = await knex.schema.hasColumn("clients", "notification_email");
  const hasWebhook = await knex.schema.hasColumn("clients", "notification_webhook_url");
  if (!hasEmail || !hasWebhook) {
    await knex.schema.alterTable("clients", (t) => {
      if (!hasEmail) t.string("notification_email", 255).nullable();
      if (!hasWebhook) t.string("notification_webhook_url", 500).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("clients", (t) => {
    t.dropColumn("notification_webhook_url");
    t.dropColumn("notification_email");
  });
}
