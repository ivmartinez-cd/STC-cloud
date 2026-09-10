import type { AgentReleaseRepository } from "../../../agents/domain/repositories/agent-release-repository";
import type { AgentVersionReader } from "../../application/ports/agent-version-reader";

/** Reemplaza a RedisAgentVersionReader (Fase 1 de OTA multi-canal, 10/09/2026,
 * ver docs/dev/TECH_DEBT.md UPD-3) — la metadata de versión publicada ahora
 * vive en Postgres (`agent_releases`), no en Redis sin respaldo real. El
 * dashboard muestra la versión "oficial" del canal 'stable'. */
export class PostgresAgentVersionReader implements AgentVersionReader {
  constructor(private readonly releases: AgentReleaseRepository) {}

  async getPublishedAgentVersion(): Promise<string> {
    const release = await this.releases.getLatest("stable");
    return release?.version ?? "1.0.0";
  }
}
