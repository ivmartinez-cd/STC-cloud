import type { AgentScope } from "../../domain/entities/agent";
import type { AgentDirectorySegment } from "../../domain/entities/agent-directory";
import type { AgentDirectoryRepository } from "../../domain/repositories/agent-directory-repository";
import type { ListAgentDirectoryInput } from "../dtos/agent-directory-dtos";

const SEGMENTS: ReadonlySet<string> = new Set<AgentDirectorySegment>(["sin_senal", "desactualizados", "llave_por_vencer"]);

function normalizeSegment(segment?: string): AgentDirectorySegment | undefined {
  return segment && SEGMENTS.has(segment) ? (segment as AgentDirectorySegment) : undefined;
}

/** Listado paginado/filtrado/ordenado de "Salud de nodos" (handoff hifi,
 * 25/08/2026) — mismo criterio "tolerante" que `ListClientDirectoryUseCase`.
 * Resuelve la versión PUBLICADA acá (el repo sólo sabe de Knex, no de Redis)
 * para comparar contra `agents.version` en una sola pasada de SQL. */
export class ListAgentDirectoryUseCase {
  constructor(
    private readonly repo: AgentDirectoryRepository,
    private readonly getPublishedVersion: () => Promise<string>
  ) {}

  async execute(input: ListAgentDirectoryInput) {
    const publishedVersion = await this.getPublishedVersion();
    return this.repo.listDirectory({
      scope: input.scope,
      q: input.q?.trim() || undefined,
      segment: normalizeSegment(input.segment),
      sortDir: input.sortDir === "asc" ? "asc" : "desc",
      limit: input.limit, offset: input.offset,
      publishedVersion,
    });
  }
}

/** Tira de 4 métricas de flota (handoff hifi "Salud de nodos"). */
export class GetAgentFleetSummaryUseCase {
  constructor(
    private readonly repo: AgentDirectoryRepository,
    private readonly getPublishedVersion: () => Promise<string>
  ) {}

  async execute(scope: AgentScope) {
    return this.repo.getFleetSummary(scope, await this.getPublishedVersion());
  }
}

/** Distribución por antigüedad de señal (4 buckets fijos, handoff hifi). */
export class GetAgentSignalBucketsUseCase {
  constructor(private readonly repo: AgentDirectoryRepository) {}
  execute(scope: AgentScope) {
    return this.repo.getSignalBuckets(scope);
  }
}
