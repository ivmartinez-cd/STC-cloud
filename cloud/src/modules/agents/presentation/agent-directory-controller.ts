import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import { getScope } from "../../../api/utils/scope";
import { getPublishedAgentVersion } from "../../../services/agentVersionService";
import { GetAgentFleetSummaryUseCase, GetAgentSignalBucketsUseCase, ListAgentDirectoryUseCase } from "../application/use-cases/agent-directory-use-cases";
import { KnexAgentDirectoryRepository } from "../infrastructure/database/knex-agent-directory-repository";

type DirectoryQuery = { q?: string; segment?: string; dir?: string; limit?: string; offset?: string };

function runListAgentDirectory(uc: ListAgentDirectoryUseCase, request: FastifyRequest) {
  const q = request.query as DirectoryQuery;
  return uc.execute({
    scope: getScope(request), q: q.q, segment: q.segment, sortDir: q.dir,
    limit: q.limit !== undefined ? Number(q.limit) : undefined,
    offset: q.offset !== undefined ? Number(q.offset) : undefined,
  });
}

/** Handlers de "Salud de nodos" (handoff hifi, 25/08/2026) — repo/use cases
 * propios (ver docblock de `KnexAgentDirectoryRepository`), cableados acá en
 * vez de en `agent-wiring.ts`: ese cableado tipa `redis` con la interfaz
 * reducida `RedisClient` del dominio, y acá hace falta el `Redis` real de
 * `ioredis` que ya recibe `registerPortalAgentRoutes` (mismo que usa
 * `dashboardController` para la versión publicada de agente). */
export function createAgentDirectoryController(db: Knex, redis: Redis) {
  const repo = new KnexAgentDirectoryRepository(db);
  const getPublishedVersion = () => getPublishedAgentVersion(redis);
  const directory = new ListAgentDirectoryUseCase(repo, getPublishedVersion);
  const summary = new GetAgentFleetSummaryUseCase(repo, getPublishedVersion);
  const buckets = new GetAgentSignalBucketsUseCase(repo);
  return {
    listAgentDirectory: (request: FastifyRequest) => runListAgentDirectory(directory, request),
    getAgentFleetSummary: (request: FastifyRequest) => summary.execute(getScope(request)),
    getAgentSignalBuckets: (request: FastifyRequest) => buckets.execute(getScope(request)),
  };
}
