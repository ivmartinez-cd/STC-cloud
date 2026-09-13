import type { AgentReleaseRepository } from "../../../agents/domain/repositories/agent-release-repository";
import type { AgentVersionReader } from "../../application/ports/agent-version-reader";

/** Canales que el parque puede estar corriendo (ver `agent/src/core/channel.ts`). */
const CHANNELS = ["stable", "legacy"] as const;

/** Reemplaza a RedisAgentVersionReader (Fase 1 de OTA multi-canal, 10/09/2026,
 * ver docs/dev/TECH_DEBT.md UPD-3) — la metadata de versión publicada ahora
 * vive en Postgres (`agent_releases`), no en Redis sin respaldo real. */
export class PostgresAgentVersionReader implements AgentVersionReader {
  constructor(private readonly releases: AgentReleaseRepository) {}

  /** Compatibilidad: "la" versión publicada a secas sigue siendo la de `stable`. */
  async getPublishedAgentVersion(): Promise<string> {
    const release = await this.releases.getLatest("stable");
    return release?.version ?? "1.0.0";
  }

  async getPublishedVersionsByChannel(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const channel of CHANNELS) {
      const version = (await this.releases.getLatest(channel))?.version;
      // Un canal sin ningún release todavía no se informa: mejor ausente que un "1.0.0" inventado.
      if (version) out[channel] = version;
    }
    return out;
  }
}
