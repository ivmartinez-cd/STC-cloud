import {
  consumeEwsTicket, createEwsSession, destroyEwsSession, mintEwsTicket, readEwsSession, updateEwsSession,
  type EwsRedisClient, type EwsSession, type EwsSessionPatch,
} from "../../../../services/ewsGatewayService";
import type { EwsSessionStore } from "../../application/ports/ews-session-store";

/** Adapter sobre `services/ewsGatewayService.ts` (Redis con TTL deslizante). */
export class RedisEwsSessionStore implements EwsSessionStore {
  constructor(private readonly redis: EwsRedisClient) {}

  create(data: Omit<EwsSession, "cookies" | "createdAt">): Promise<string> {
    return createEwsSession(this.redis, data);
  }

  mintTicket(sessionId: string): Promise<string> {
    return mintEwsTicket(this.redis, sessionId);
  }

  consumeTicket(ticket: string): Promise<string | null> {
    return consumeEwsTicket(this.redis, ticket);
  }

  read(id: string): Promise<EwsSession | null> {
    return readEwsSession(this.redis, id);
  }

  update(id: string, patch: EwsSessionPatch): Promise<void> {
    return updateEwsSession(this.redis, id, patch);
  }

  destroy(id: string): Promise<void> {
    return destroyEwsSession(this.redis, id);
  }
}
