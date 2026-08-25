import fs from "fs";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { logger } from "../logger";

/**
 * Diagnóstico de arranque previo a `db.migrate.latest()`: qué archivos de migración
 * ve el proceso y cuáles ya están aplicadas. Sólo informa; ningún fallo acá frena
 * el arranque (en la primera corrida `knex_migrations` todavía no existe).
 */
export async function logMigrationDiagnostics(db: Knex, migDir: string): Promise<void> {
  try {
    logger.info(`[DB] Directorio de migraciones: ${migDir}`);
    if (fs.existsSync(migDir)) {
      logger.info(`[DB] Archivos encontrados: ${fs.readdirSync(migDir).join(", ")}`);
    } else {
      logger.error(`[DB] ERROR: El directorio de migraciones NO existe: ${migDir}`);
    }
  } catch { /* diagnóstico opcional: un fallo al listar no debe frenar el arranque */ }

  try {
    const applied = await db("knex_migrations").select("name");
    logger.info(`[DB] Migraciones en DB: ${applied.map((m: { name: string }) => m.name).join(", ")}`);
  } catch { /* primera corrida: knex_migrations todavía no existe */ }
}

/**
 * Apagado ordenado: cierra Fastify (drena requests en vuelo) y sale con 0.
 * Además de ser lo correcto para `docker stop` / systemd, es lo que permite que V8
 * vuelque NODE_V8_COVERAGE en CI (un proceso matado por señal no lo escribe) —
 * ver scripts/check-coverage.mjs.
 */
export function registerGracefulShutdown(fastify: FastifyInstance): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      fastify.log.info(`${signal} recibido, cerrando…`);
      fastify.close().then(() => process.exit(0), () => process.exit(0));
    });
  }
}
