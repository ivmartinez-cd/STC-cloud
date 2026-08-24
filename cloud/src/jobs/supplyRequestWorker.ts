import { Queue } from "bullmq";
import Redis from "ioredis";
import knex from "knex";
import knexConfig from "../db/knexfile";
import { logger } from "../logger";
import { runGuardedTick } from "../modules/observability/guarded-tick";
import { KnexSupplyRequestRepository } from "../modules/supply-requests/infrastructure/database/knex-supply-request-repository";
import {
  KnexEnabledClients,
  KnexSupplySnapshot,
} from "../modules/supply-requests/infrastructure/database/knex-supply-snapshot";
import { BullRequestNotifier } from "../modules/supply-requests/infrastructure/queue/bull-request-notifier";
import {
  autoCompleteReplaced,
  openDueRequests,
} from "../modules/supply-requests/application/use-cases/detect-supply-requests";

/**
 * Detección de pedidos de consumibles (Fase 4.2 del gap analysis vs HP SDS).
 * `setInterval` a propósito (mismo criterio y cadencia que incidentWorker:
 * un solo `api` sin réplicas, 2 min). El tick es barato cuando no hay
 * clientes con el opt-in activo (una sola query), y el dedup real lo hace
 * el índice único parcial `supply_requests_open_uniq`, no el timing.
 */
const INTERVAL_MINUTES = 2;

const db = knex(knexConfig.development);
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryStrategy() { return 10000; },
});
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const notificationsQueue = new Queue("notifications-queue", { connection: redis as any });

const deps = {
  repo: new KnexSupplyRequestRepository(db),
  snapshot: new KnexSupplySnapshot(db),
  clients: new KnexEnabledClients(db),
  notifier: new BullRequestNotifier(notificationsQueue),
};

let running = false;

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Lock multi-réplica + métricas + Sentry — Fase 5.3 (el catch vive en el wrapper).
    await runGuardedTick(db, "supply-requests", async () => {
      const completed = await autoCompleteReplaced(deps);
      const opened = await openDueRequests(deps);
      if (opened || completed) {
        logger.info({ opened, completed }, "[SupplyRequests] tick con novedades");
      }
    });
  } finally {
    running = false;
  }
}

setInterval(() => void tick(), INTERVAL_MINUTES * 60 * 1000);
setTimeout(() => void tick(), 15_000); // primer tick al arrancar (tras migraciones)
logger.info(`[SupplyRequests] worker iniciado (tick cada ${INTERVAL_MINUTES} min)`);
