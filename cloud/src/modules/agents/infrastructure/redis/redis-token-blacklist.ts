import type { RedisClient } from "../../domain/entities/agent";
import type { TokenBlacklist } from "../../application/ports/token-blacklist";

/** `blacklist:<agentId>` con TTL — la lee `authMiddleware`/`ws` en cada request/conexión. */
export class RedisTokenBlacklist implements TokenBlacklist {
  constructor(private readonly redis: RedisClient) {}

  async add(agentId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`blacklist:${agentId}`, "true", "EX", ttlSeconds);
  }

  async has(agentId: string): Promise<boolean> {
    return !!(await this.redis.get(`blacklist:${agentId}`));
  }
}
