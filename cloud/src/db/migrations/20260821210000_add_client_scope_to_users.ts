import type { Knex } from "knex";

/**
 * RBAC por cliente: agrega `users.client_id` para el rol `client_viewer` (un usuario
 * atado a exactamente un cliente, para no filtrar datos de otros inquilinos por el
 * portal). Dos CHECK constraints cierran el "eje rol" también a nivel de base, no sólo
 * en el schema de la ruta:
 *   - `role` deja de ser texto libre: sólo admin/operator/client_viewer.
 *   - un `client_viewer` sin `client_id` es un estado inválido (el middleware lo trataría
 *     como "denegar todo", pero mejor que la base ni lo permita).
 * `ON DELETE CASCADE`: si se borra un cliente, sus usuarios `client_viewer` quedarían sin
 * cliente — que la segunda CHECK prohíbe — así que se borran junto con el cliente en vez
 * de quedar en un estado que la propia base rechaza.
 *
 * También suma el índice sobre `devices.agent_id` que falta hoy (el único índice
 * existente sobre esa columna es el parcial `devices_agent_serial_unique`, que el
 * planner no puede usar para `agent_id IN (...)`): todo el scoping por cliente resuelve
 * primero los agentes del cliente y después filtra dispositivos por esa lista.
 */
export async function up(knex: Knex): Promise<void> {
  const hasClientId = await knex.schema.hasColumn("users", "client_id");
  if (!hasClientId) {
    await knex.schema.alterTable("users", (t) => {
      t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS users_client_id_idx ON users (client_id)`);
  }

  const { rows: roleCheckRows } = await knex.raw(
    `SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'`
  );
  if (roleCheckRows.length === 0) {
    await knex.raw(
      `ALTER TABLE users ADD CONSTRAINT users_role_check
         CHECK (role IN ('admin', 'operator', 'client_viewer'))`
    );
  }

  const { rows: scopeCheckRows } = await knex.raw(
    `SELECT 1 FROM pg_constraint WHERE conname = 'users_client_viewer_requires_client_check'`
  );
  if (scopeCheckRows.length === 0) {
    await knex.raw(
      `ALTER TABLE users ADD CONSTRAINT users_client_viewer_requires_client_check
         CHECK (role <> 'client_viewer' OR client_id IS NOT NULL)`
    );
  }

  await knex.raw(`CREATE INDEX IF NOT EXISTS devices_agent_id_idx ON devices (agent_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_client_viewer_requires_client_check`);
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await knex.raw(`DROP INDEX IF EXISTS devices_agent_id_idx`);
  const hasClientId = await knex.schema.hasColumn("users", "client_id");
  if (hasClientId) {
    await knex.raw(`DROP INDEX IF EXISTS users_client_id_idx`);
    await knex.schema.alterTable("users", (t) => {
      t.dropColumn("client_id");
    });
  }
}
