import type { Knex } from "knex";

/**
 * Fase 7 del gap analysis vs HP SDS (agente v1.2.0): RESTART_PRINTER se
 * sumó al dominio (`REMOTE_ACTIONS` en remote-action-batch.ts) pero la
 * migración original `20260824150000_remote_action_batches.ts` dejó el
 * CHECK de `action` fijo a las 4 acciones de agente ('RESCAN','FORCE_SCAN',
 * 'RESTART','FORCE_UPDATE') — cualquier INSERT con 'RESTART_PRINTER'
 * viola `remote_action_batches_action_check` con un 500. Se reemplaza el
 * constraint para incluirla.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE remote_action_batches
      DROP CONSTRAINT IF EXISTS remote_action_batches_action_check
  `);
  await knex.raw(`
    ALTER TABLE remote_action_batches
      ADD CONSTRAINT remote_action_batches_action_check CHECK (action IN
        ('RESCAN','FORCE_SCAN','RESTART','FORCE_UPDATE','RESTART_PRINTER'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE remote_action_batches
      DROP CONSTRAINT IF EXISTS remote_action_batches_action_check
  `);
  await knex.raw(`
    ALTER TABLE remote_action_batches
      ADD CONSTRAINT remote_action_batches_action_check CHECK (action IN
        ('RESCAN','FORCE_SCAN','RESTART','FORCE_UPDATE'))
  `);
}
