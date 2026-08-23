import crypto from "crypto";
import Redis from "ioredis";

/**
 * Ticket de un solo uso para el handshake WS del portal. Reemplaza el JWT de
 * sesión completo que antes viajaba por `?token=` — un ticket robado de un
 * log/proxy/historial del navegador sirve como máximo `TICKET_TTL_SECONDS` y
 * una sola vez, en vez de durante toda la sesión del usuario.
 */
const TICKET_TTL_SECONDS = 60;

export interface WsTicketPayload {
  userId: string;
  role: string;
}

function ticketKey(ticket: string): string {
  return `ws-ticket:${ticket}`;
}

export async function mintWsTicket(redis: Redis, payload: WsTicketPayload): Promise<string> {
  const ticket = crypto.randomBytes(32).toString("hex");
  await redis.set(ticketKey(ticket), JSON.stringify(payload), "EX", TICKET_TTL_SECONDS);
  return ticket;
}

/** Atómico (GETDEL): consume el ticket de forma que un segundo intento con el mismo valor falle siempre. */
export async function consumeWsTicket(redis: Redis, ticket: string): Promise<WsTicketPayload | null> {
  const raw = await redis.getdel(ticketKey(ticket));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WsTicketPayload;
  } catch {
    return null;
  }
}
