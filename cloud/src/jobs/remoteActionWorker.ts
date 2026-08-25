import knex from "knex";
import knexConfig from "../db/knexfile";
import { logger } from "../logger";
import { runGuardedTick } from "../modules/observability/guarded-tick";
import { AgentCommandService } from "../modules/agents";
import { createRemoteActionProcessor } from "../modules/remote-actions";

/**
 * Despacho y reconciliación de lotes de acciones remotas (Fase 4.6 del gap
 * analysis vs HP SDS). `setInterval` 60s, mismo criterio que el resto de
 * los jobs: un solo `api` sin réplicas. El despacho crea `agent_commands`
 * (la entrega real la hace el heartbeat existente del agente); la
 * reconciliación cierra el lote cuando todos sus comandos terminaron.
 */
const INTERVAL_MS = 60_000;

const db = knex(knexConfig.development);
const processor = createRemoteActionProcessor(db, new AgentCommandService(db));

let running = false;

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Lock multi-réplica + métricas + Sentry — Fase 5.3 (el catch vive en el wrapper).
    await runGuardedTick(db, "remote-actions", async () => {
      const dispatched = await processor.dispatchDue(new Date());
      const closed = await processor.reconcileSent();
      if (dispatched || closed) {
        logger.info({ dispatched, closed }, "[RemoteActions] tick con novedades");
      }
    });
  } finally {
    running = false;
  }
}

setInterval(() => void tick(), INTERVAL_MS);
logger.info("[RemoteActions] worker iniciado (tick cada 60s)");
