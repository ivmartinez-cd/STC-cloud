import type { Knex } from "knex";

/**
 * Códigos de recuperación de 2FA (Fase 6.2 del bloque de seguridad —
 * complemento de 6.1: sin esto, perder el teléfono requería que un admin
 * borrara el flag por base). 10 códigos de un solo uso, generados al
 * activar 2FA y regenerables con un TOTP vigente.
 *
 * Se guardan HASHEADOS con SHA-256 (nunca en claro): son secretos de alta
 * entropía generados por el servidor (50+ bits aleatorios), no contraseñas
 * humanas — el hash rápido es la práctica estándar acá (el costo de un KDF
 * lento solo se justifica contra fuerza bruta de secretos débiles). Un
 * código usado se marca con `used_at` en vez de borrarse: auditabilidad de
 * cuándo se quemó cada uno.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("user_recovery_codes");
  if (has) return;

  await knex.schema.createTable("user_recovery_codes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("code_hash", 64).notNullable(); // sha256 hex
    t.timestamp("used_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX user_recovery_codes_active_idx
      ON user_recovery_codes (user_id) WHERE used_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_recovery_codes");
}
