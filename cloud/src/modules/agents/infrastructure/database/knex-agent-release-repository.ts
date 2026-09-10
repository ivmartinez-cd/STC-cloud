import type { Knex } from "knex";
import type { AgentRelease } from "../../domain/entities/agent";
import type { AgentReleaseRepository, NewAgentRelease } from "../../domain/repositories/agent-release-repository";

const TABLE = "agent_releases";

export class KnexAgentReleaseRepository implements AgentReleaseRepository {
  constructor(private readonly db: Knex) {}

  async getLatest(channel: string): Promise<AgentRelease | null> {
    return (
      (await this.db(TABLE).where({ channel }).orderBy("published_at", "desc").first()) ?? null
    );
  }

  async publish(release: NewAgentRelease): Promise<AgentRelease> {
    const [row] = await this.db(TABLE)
      .insert({
        version: release.version,
        channel: release.channel,
        kind: release.kind,
        url: release.url,
        sha256: release.sha256,
        published_by: release.publishedBy,
        published_at: new Date(),
      })
      // Republicar la misma (version, channel) actualiza en vez de duplicar —
      // útil para corregir un release recién subido sin bumpear versión.
      .onConflict(["version", "channel"])
      .merge(["kind", "url", "sha256", "published_by", "published_at"])
      .returning("*");
    return row;
  }
}
