import type { Knex } from 'knex';

/**
 * API pública con API keys por cliente + webhooks de integración ERP
 * (Fase 2 del gap analysis). `api_keys` guarda sólo el hash SHA-256 del
 * key completo (nunca el valor en claro — a diferencia de `activation_key`
 * de agente, esta vive indefinidamente en la DB, no se anula tras un uso).
 * `api_webhooks` es una fila por CLIENTE (no por key) para que rotar una
 * key no rompa la suscripción de webhook ya configurada.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('key_hash', 64).notNullable().unique();
    t.string('key_prefix', 12).notNullable();
    t.timestamp('revoked_at').nullable();
    t.timestamp('last_used_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX api_keys_client_id_idx ON api_keys (client_id)');

  await knex.schema.createTable('api_webhooks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('client_id').notNullable().unique().references('id').inTable('clients').onDelete('CASCADE');
    t.string('url', 500).notNullable();
    t.jsonb('events').notNullable().defaultTo(JSON.stringify(['reading.created', 'alert.created', 'report.closed']));
    t.string('secret', 64).notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_webhooks');
  await knex.schema.dropTableIfExists('api_keys');
}
