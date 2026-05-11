import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Re-point readings to the canonical device (oldest per agent+serial) before deleting duplicates
  await knex.raw(`
    WITH canonical AS (
      SELECT DISTINCT ON (agent_id, serial) id, agent_id, serial
      FROM devices
      WHERE serial IS NOT NULL
      ORDER BY agent_id, serial, created_at ASC
    ),
    duplicates AS (
      SELECT d.id AS dup_id, c.id AS keep_id
      FROM devices d
      JOIN canonical c ON c.serial = d.serial AND c.agent_id = d.agent_id
      WHERE d.id != c.id
    )
    UPDATE readings r
    SET device_id = dup.keep_id
    FROM duplicates dup
    WHERE r.device_id = dup.dup_id
  `);

  // Delete duplicate devices (keep oldest created_at per agent_id + serial)
  await knex.raw(`
    DELETE FROM devices
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY agent_id, serial ORDER BY created_at ASC) AS rn
        FROM devices
        WHERE serial IS NOT NULL
      ) ranked
      WHERE rn > 1
    )
  `);

  // Partial unique index: one device per (agent_id, serial) when serial is known
  await knex.raw(`
    CREATE UNIQUE INDEX devices_agent_serial_unique
    ON devices (agent_id, serial)
    WHERE serial IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS devices_agent_serial_unique");
}
