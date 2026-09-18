import type { Knex } from "knex";
import { logger } from "../../logger";
import { captureError } from "./sentry";
import { observeJobTick } from "../metrics/registry";

/**
 * Wrapper común de los ticks de jobs `setInterval` (Fase 5.3 de
 * producción-readiness). Hace tres cosas en un solo lugar:
 *
 * 1. **Advisory lock de Postgres** (`pg_try_advisory_lock`): si otra réplica
 *    ya está corriendo el mismo tick, este se saltea. Es la estrategia que
 *    el propio código dejó prescripta en el docblock de
 *    `jobs/heartbeatMonitor.ts` (23/08/2026) para el pasaje a multi-réplica
 *    — un lock barato por check, no una cola.
 * 2. **Métricas Prometheus** (resultado + duración + último éxito por job).
 * 3. **Sentry** best-effort en el catch.
 *
 * El lock usa la forma de dos int4 (classid, objid): classid fijo 0x53_54_43
 * ("STC") como namespace, objid = hash FNV-1a del nombre del job.
 */
const LOCK_CLASSID = 0x53_54_43; // "STC"

/** FNV-1a 32 bits, ajustado al rango de int4 firmado de Postgres. */
export function lockIdFor(name: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash | 0; // int4 firmado
}

/**
 * El lock de sesión vive en UNA conexión: tomarlo y soltarlo con `db.raw`
 * suelto deja que el pool sirva el unlock desde otra, que no lo tiene — el
 * lock queda colgado de una conexión ociosa del pool y todos los ticks
 * siguientes se saltean en silencio (VM, 17/09/2026: `dashboard-snapshot`
 * dejó de escribir tras 3 tomas). Por eso ambos corren sobre la misma
 * conexión, retenida mientras dura el tick.
 */
async function tryLock(db: Knex, conn: unknown, objid: number): Promise<boolean> {
  const result = await db.raw("SELECT pg_try_advisory_lock(?, ?) AS locked", [LOCK_CLASSID, objid]).connection(conn);
  return result.rows?.[0]?.locked === true;
}

async function unlock(db: Knex, conn: unknown, objid: number): Promise<void> {
  await db.raw("SELECT pg_advisory_unlock(?, ?)", [LOCK_CLASSID, objid]).connection(conn).catch(() => {});
}

export async function runGuardedTick(
  db: Knex,
  name: string,
  fn: () => Promise<void>
): Promise<"ok" | "error" | "skipped"> {
  const objid = lockIdFor(name);
  const started = Date.now();
  const conn = await db.client.acquireConnection();
  try {
    if (!(await tryLock(db, conn, objid))) {
      observeJobTick(name, "skipped", 0);
      return "skipped";
    }
    try {
      await fn();
      observeJobTick(name, "ok", Date.now() - started);
      return "ok";
    } catch (err) {
      observeJobTick(name, "error", Date.now() - started);
      logger.error({ err, job: name }, `[${name}] fallo del tick`);
      captureError(err, { job: name });
      return "error";
    } finally {
      await unlock(db, conn, objid);
    }
  } finally {
    await db.client.releaseConnection(conn);
  }
}
