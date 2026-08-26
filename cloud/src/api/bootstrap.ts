import type { Knex } from "knex";
import { logger } from "../logger";

/**
 * Normaliza `knex_migrations.name` a la extensión que corresponde al modo de
 * ejecución actual (`.ts` en dev vía tsx/ts-node, `.js` contra `dist/`
 * compilado) — sin esto, correr una vez en un modo y después en el otro hace
 * que knex crea que faltan migraciones por aplicar (nombre no matchea).
 */
export async function normalizeMigrationExtensions(db: Knex, isTs: boolean): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("knex_migrations");
    if (!hasTable) return;
    if (isTs) {
      await db.raw(
        `UPDATE knex_migrations SET name = REPLACE(name, '.js', '.ts') WHERE name LIKE '%.js'`
      );
      logger.info("[DB] Normalizadas migraciones a .ts para ejecución de desarrollo.");
    } else {
      await db.raw(
        `UPDATE knex_migrations SET name = REPLACE(name, '.ts', '.js') WHERE name LIKE '%.ts'`
      );
      logger.info("[DB] Normalizadas migraciones a .js para ejecución de producción/compilada.");
    }
  } catch {
    logger.warn("[DB] No se pudo normalizar knex_migrations (posiblemente primera ejecución)");
  }
}

/** Auto-inicializar primer administrador si la tabla `users` está vacía. */
export async function bootstrapDefaultAdmin(db: Knex): Promise<void> {
  try {
    const { hashPassword } = require("./utils/password");
    const usersCount = await db("users").count("id as count").first();
    const count = parseInt((usersCount?.count as string) || "0", 10);
    if (count === 0) {
      logger.info("[DB] Inicializando usuario administrador por defecto...");
      const adminUser = (process.env.PORTAL_ADMIN_USER || "admin").toLowerCase();
      const adminPass = process.env.PORTAL_ADMIN_PASSWORD || "stc123456";
      await db("users").insert({
        id: db.raw("gen_random_uuid()"),
        username: adminUser,
        password_hash: hashPassword(adminPass),
        role: "admin",
        active: true,
      });
      logger.info(`[DB] Usuario administrador '${adminUser}' inicializado con éxito.`);
    }
  } catch (bootErr: unknown) {
    const errMsg = bootErr instanceof Error ? bootErr.message : String(bootErr);
    logger.error({ err: errMsg }, "[DB] Error al inicializar administrador");
  }
}
