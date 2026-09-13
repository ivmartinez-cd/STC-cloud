import type { EwsSession } from "../../../../services/ewsGatewayService";

export type { EwsSession };

/**
 * Puerto del almacén de sesiones del gateway de EWS remoto. Existe para que
 * los casos de uso no toquen Redis directamente (`arch-application`): la
 * implementación real es `RedisEwsSessionStore`, sobre
 * `services/ewsGatewayService.ts`.
 */
export interface EwsSessionStore {
  create(data: Omit<EwsSession, "cookies" | "createdAt">): Promise<string>;
  /** Ticket de un solo uso para cruzar del origen del portal al del gateway. */
  mintTicket(sessionId: string): Promise<string>;
  consumeTicket(ticket: string): Promise<string | null>;
  read(id: string): Promise<EwsSession | null>;
  update(id: string, patch: Partial<EwsSession>): Promise<void>;
  destroy(id: string): Promise<void>;
}
