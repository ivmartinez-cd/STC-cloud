import type Redis from "ioredis";
import { getPublishedAgentVersion } from "../../../../services/agentVersionService";
import type { AgentVersionReader } from "../../application/ports/agent-version-reader";

export class RedisAgentVersionReader implements AgentVersionReader {
  constructor(private readonly redis: Redis) {}

  getPublishedAgentVersion() {
    return getPublishedAgentVersion(this.redis);
  }
}
