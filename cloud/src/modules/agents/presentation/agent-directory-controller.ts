import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getScope } from "../../../api/utils/scope";
import { KnexAgentReleaseRepository } from "../infrastructure/database/knex-agent-release-repository";
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
 * vez de en `agent-wiring.ts`. La versión publicada de agente ahora sale de
 * `agent_releases` (Postgres, canal 'stable') en vez de Redis sin respaldo
 * real (Fase 1 de OTA multi-canal, 10/09/2026, ver docs/dev/TECH_DEBT.md UPD-3). */
export function createAgentDirectoryController(db: Knex) {
  const repo = new KnexAgentDirectoryRepository(db);
  const releases = new KnexAgentReleaseRepository(db);
  const getPublishedVersion = async () => (await releases.getLatest("stable"))?.version ?? "1.0.0";
  const directory = new ListAgentDirectoryUseCase(repo, getPublishedVersion);
  const summary = new GetAgentFleetSummaryUseCase(repo, getPublishedVersion);
  const buckets = new GetAgentSignalBucketsUseCase(repo);
  return {
    listAgentDirectory: (request: FastifyRequest) => runListAgentDirectory(directory, request),
    getAgentFleetSummary: (request: FastifyRequest) => summary.execute(getScope(request)),
    getAgentSignalBuckets: (request: FastifyRequest) => buckets.execute(getScope(request)),
  };
}
