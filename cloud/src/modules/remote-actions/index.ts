import type { Knex } from "knex";
import { KnexRemoteActionRepository } from "./infrastructure/database/knex-remote-action-repository";
import { dispatchDueBatches, reconcileSentBatches, type CommandEnqueuer } from "./application/use-cases/process-batches";

/**
 * Facade del módulo `remote-actions` (guía §2: los consumidores externos importan
 * el índice, no los internals). Lo que necesita `jobs/remoteActionWorker.ts`:
 * un procesador ya cableado sobre Knex y la cola de comandos de agentes.
 */
export type { CommandEnqueuer } from "./application/use-cases/process-batches";
export type { RemoteActionBatch, BatchStatus, RemoteAction } from "./domain/entities/remote-action-batch";
export { registerRemoteActionRoutes } from "./presentation/remote-action-routes";

export interface RemoteActionProcessor {
  /** Despacha lotes programados vencidos → crea los `agent_commands`. Devuelve cuántos. */
  dispatchDue(now: Date): Promise<number>;
  /** Cierra los lotes enviados cuyos comandos ya terminaron. Devuelve cuántos. */
  reconcileSent(): Promise<number>;
}

export function createRemoteActionProcessor(db: Knex, commands: CommandEnqueuer): RemoteActionProcessor {
  const repo = new KnexRemoteActionRepository(db);
  return {
    dispatchDue: (now) => dispatchDueBatches(repo, commands, now),
    reconcileSent: () => reconcileSentBatches(repo),
  };
}
