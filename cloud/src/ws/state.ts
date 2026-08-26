import { setWsCountsProvider } from '../modules/metrics/registry';

// ─── Tipos Internos del Módulo WebSocket ──────────────────────────────────────

/** Interfaz mínima de un socket WebSocket (compatible con @fastify/websocket). */
export interface WebSocketClient {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  on(event: string, handler: Function): void;
  once(event: string, handler: Function): void;
}

/** Payload decodificado del JWT para autenticación WebSocket. */
export interface WsJwtPayload {
  agentId?: string;
  userId?: string;
  role?: string;
}

/** Conexión de portal ya resuelta contra la base (rol + cliente del usuario). */
export interface PortalConn {
  socket: WebSocketClient;
  role: string;
  clientId: string | null;
}

// Almacena clientes conectados — único dueño de este estado; todo lo demás lo importa.
export const portalClients = new Set<PortalConn>();
export const agentClients = new Map<string, WebSocketClient>();

/** Conteo de conexiones vivas para la métrica `stc_ws_connections`. */
export function wsConnectionCounts(): { agents: number; portals: number } {
  return { agents: agentClients.size, portals: portalClients.size };
}
setWsCountsProvider(wsConnectionCounts);

/**
 * Envía un comando remoto a un agente DCA conectado vía WebSocket.
 * @param agentId - UUID del agente destinatario.
 * @param commandType - Tipo de comando (RESCAN, RESTART, etc.).
 * @param payload - Datos adicionales del comando.
 * @param commandId - ID único del comando para tracking.
 * @returns `true` si el agente está conectado y el mensaje fue enviado.
 */
export function sendCommandToAgent(agentId: string, commandType: string, payload: Record<string, unknown> = {}, commandId?: string) {
  const socket = agentClients.get(agentId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'command', id: commandId, commandType, payload }));
    return true;
  }
  return false;
}
