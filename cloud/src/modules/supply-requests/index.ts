import type { Knex } from "knex";
import type { Queue } from "bullmq";
import { KnexSupplyRequestRepository } from "./infrastructure/database/knex-supply-request-repository";
import { KnexEnabledClients, KnexSupplySnapshot } from "./infrastructure/database/knex-supply-snapshot";
import { BullRequestNotifier } from "./infrastructure/queue/bull-request-notifier";
import { autoCompleteReplaced, openDueRequests } from "./application/use-cases/detect-supply-requests";

/**
 * Facade del módulo `supply-requests`. `jobs/supplyRequestWorker.ts` recibe un
 * detector ya cableado (repo + snapshot + clientes con opt-in + notificador
 * BullMQ) en vez de instanciar los adaptadores de infraestructura a mano.
 */
export { registerSupplyRequestRoutes } from "./presentation/supply-request-routes";

export interface SupplyRequestDetector {
  /** Cierra automáticamente pedidos cuyo insumo ya fue reemplazado. Devuelve cuántos. */
  autoCompleteReplaced(): Promise<number>;
  /** Abre pedidos para insumos bajo umbral en clientes con opt-in. Devuelve cuántos. */
  openDueRequests(): Promise<number>;
}

export function createSupplyRequestDetector(db: Knex, notificationsQueue: Queue): SupplyRequestDetector {
  const deps = {
    repo: new KnexSupplyRequestRepository(db),
    snapshot: new KnexSupplySnapshot(db),
    clients: new KnexEnabledClients(db),
    notifier: new BullRequestNotifier(notificationsQueue),
  };
  return {
    autoCompleteReplaced: () => autoCompleteReplaced(deps),
    openDueRequests: () => openDueRequests(deps),
  };
}
