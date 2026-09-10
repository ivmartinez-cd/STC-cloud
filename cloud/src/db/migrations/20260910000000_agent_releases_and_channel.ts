import type { Knex } from "knex";

/**
 * Fase 1 de "OTA multi-canal" (10/09/2026, ver docs/dev/TECH_DEBT.md UPD-1/2/3):
 * la metadata de versión publicada vivía SOLO en Redis (con `local_settings.json`
 * como respaldo que en producción nunca persiste — UPD-3), y era una sola
 * global para todos los agentes, sin importar que un agente legacy (Server
 * 2008 R2, runtime Node 20.2.0) no pueda instalar el mismo paquete que uno
 * moderno (Node 24). `agent_releases` es ahora la fuente de verdad real
 * (Postgres, con backup) y separa por `channel`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("agent_releases", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("version", 20).notNullable();
    // 'stable' (runtime moderno, Node 24 / .NET 9) | 'legacy' (Node 20.2.0 /
    // .NET Framework 4.8, ver agent/build-sea.js --channel).
    table.string("channel", 20).notNullable();
    // 'bundle' (bundle.js suelto, rollback automático) | 'zip' (stc-update.zip,
    // parche completo vía robocopy, sin rollback automático — ver UPD-5).
    table.string("kind", 10).notNullable();
    table.text("url").notNullable();
    table.string("sha256", 64).notNullable();
    table.string("published_by", 100);
    table.timestamp("published_at").defaultTo(knex.fn.now());
    table.unique(["version", "channel"]);
    table.index(["channel", "published_at"]);
  });

  await knex.schema.alterTable("agents", (table) => {
    // Reportado por el propio agente en cada heartbeat (agent/src/core/channel.ts,
    // constante embebida en build time vía esbuild --define, no algo que el
    // agente decida en runtime) — default 'stable' para que agentes ya
    // instalados que todavía no mandan este campo no rompan nada.
    table.string("channel", 20).notNullable().defaultTo("stable");
    // Versión de Node.js que reporta el propio proceso (`process.version`) —
    // solo informativo, para diagnosticar en el portal sin tener que pedirle
    // el log al cliente.
    table.string("runtime", 30);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (table) => {
    table.dropColumn("channel");
    table.dropColumn("runtime");
  });
  await knex.schema.dropTable("agent_releases");
}
