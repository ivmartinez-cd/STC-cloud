/** Blacklist de tokens revocados (Redis, con TTL). */
export interface TokenBlacklist {
  add(agentId: string, ttlSeconds: number): Promise<void>;
  has(agentId: string): Promise<boolean>;
}
