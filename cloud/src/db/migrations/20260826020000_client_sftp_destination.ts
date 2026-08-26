import type { Knex } from "knex";

/**
 * Destino SFTP por cliente (Fase 19 del gap analysis: export PDF + entrega
 * SFTP de reportes). A diferencia de SMTP (global, `.env.production`), SFTP
 * es inherentemente por cliente — cada uno con su propio servidor — así que
 * necesita almacenamiento propio, no una env var. `password_enc`/
 * `private_key_enc` cifrados con el mismo mecanismo que `agents.snmp_credentials`
 * (`services/cryptoService.ts`, generalizado en esta misma pasada con un
 * `purpose` por tipo de credencial — mismo `SNMP_CREDENTIALS_KEY`, subclaves
 * HKDF distintas). Una sola columna jsonb, no una tabla aparte: mismo
 * criterio ya establecido para `snmp_credentials` (reordenar/editar sin tabla
 * relacional extra).
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("clients", "sftp_destination");
  if (!hasColumn) {
    await knex.schema.alterTable("clients", (t) => {
      t.jsonb("sftp_destination").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("clients", "sftp_destination");
  if (hasColumn) {
    await knex.schema.alterTable("clients", (t) => {
      t.dropColumn("sftp_destination");
    });
  }
}
