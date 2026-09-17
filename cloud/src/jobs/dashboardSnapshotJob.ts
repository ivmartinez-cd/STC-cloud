import knex from "knex";
import knexConfig from "../db/knexfile";
import { logger } from "../logger";
import { runGuardedTick } from "../modules/observability/guarded-tick";
import { suppliesSummary } from "../modules/supplies";
import { captureDashboardSnapshot } from "../modules/dashboard";

const db = knex(knexConfig.development);

/**
 * Toma horaria de las cifras del panel de control — la que hace posible la
 * tendencia del handoff del 16/09/2026 (ver el docblock de la migración
 * `20260916190000_dashboard_snapshots.ts` para el porqué de medir en vez de
 * derivar).
 *
 * `setInterval` y no BullMQ, mismo criterio que `retentionJob.ts` y
 * `heartbeatMonitor.ts`: Redis corre con `allkeys-lru` (los repeatable jobs
 * fallarían en silencio si se desaloja su estado) y la base productiva es
 * gestionada, sin `pg_cron`. El `runGuardedTick` cubre el multi-réplica con un
 * advisory lock, así que dos APIs no escriben la misma toma dos veces — y si lo
 * hicieran, el `at` truncado a la hora + el `onConflict().merge()` del
 * repositorio lo vuelven idempotente igual.
 *
 * Una hora es la cadencia correcta y no un compromiso: la ventana más corta que
 * el panel ofrece es "últimas 24 h" con buckets horarios. Medir más seguido
 * sólo agregaría filas que nadie lee.
 *
 * La PRIMERA toma se difiere un minuto en vez de correr al importar el módulo.
 * `api/server.ts` importa los jobs arriba de todo, así que sus ticks arrancan
 * ANTES de que `start()` llegue a `db.migrate.latest()`: en el primer arranque
 * después de desplegar la migración, la tabla todavía no existe y el tick moría
 * con 42P01 ("relation dashboard_snapshots does not exist") — visto en la VM el
 * 16/09/2026. Para un job horario, empezar 60 s más tarde no cambia nada; el
 * arranque completo de la API tarda segundos, así que el margen sobra.
 */
const INTERVAL_MS = 60 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 60 * 1000;

// Los consumibles se miden con el MISMO cálculo que la tarjeta del panel
// (`GET /supplies/summary`) — si algún día cambia el umbral o la definición de
// "crítico", la serie y la cifra grande cambian juntas.
async function suppliesOf(clientId: string) {
  const summary = await suppliesSummary(db, { clientId });
  return { critical: summary.criticalCount, low: summary.lowCount };
}

export async function runDashboardSnapshot(): Promise<void> {
  await runGuardedTick(db, "dashboard-snapshot", async () => {
    const written = await captureDashboardSnapshot(db, suppliesOf);
    if (written > 0) logger.debug(`[DashboardSnapshot] ${written} toma(s) escritas`);
  });
}

setTimeout(runDashboardSnapshot, FIRST_TICK_DELAY_MS).unref();
setInterval(runDashboardSnapshot, INTERVAL_MS);

logger.info("[DashboardSnapshot] Iniciado — una toma por cliente cada hora");
