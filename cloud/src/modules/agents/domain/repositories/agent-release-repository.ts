import type { AgentRelease } from "../entities/agent";

export interface NewAgentRelease {
  version: string;
  channel: string;
  kind: string;
  url: string;
  sha256: string;
  publishedBy: string | null;
}

export interface AgentReleaseRepository {
  /** Último release publicado en ese canal (por `published_at`), o null si no hay ninguno. */
  getLatest(channel: string): Promise<AgentRelease | null>;
  /** Upsert por (version, channel) — republicar la misma versión actualiza url/hash en vez de duplicar. */
  publish(release: NewAgentRelease): Promise<AgentRelease>;
}
