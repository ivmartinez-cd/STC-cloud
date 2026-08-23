import type { Knex } from 'knex';

/**
 * Remote EWS por túnel sobre el WSS existente (Fase 2). Opt-in explícito por
 * agente — desactivado por defecto, imitando a HP SDS ("Remote EWS... está
 * desactivada por defecto y requiere whitelisting explícito del cliente",
 * `docs/cliente/STC_Comparativa_HP_SDS_vs_STC_Cloud_v1.0.html`). El toggle en
 * sí se audita como acción separada (`REMOTE_EWS_TOGGLE` en `audit_logs`),
 * distinta de cada uso puntual del proxy (`REMOTE_EWS_ACCESS`).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agents', (t) => {
    t.boolean('remote_ews_enabled').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agents', (t) => {
    t.dropColumn('remote_ews_enabled');
  });
}
