import { FastifyInstance, FastifyRequest } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AgentService } from '../services/agentService';

// ─── Tipos Internos del Módulo WebSocket ──────────────────────────────────────

/** Interfaz mínima de un socket WebSocket (compatible con @fastify/websocket). */
interface WebSocketClient {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  on(event: string, handler: Function): void;
  once(event: string, handler: Function): void;
}

/** Payload decodificado del JWT para autenticación WebSocket. */
interface WsJwtPayload {
  agentId?: string;
  userId?: string;
  role?: string;
}

// Almacena clientes conectados
const portalClients = new Set<WebSocketClient>();
const agentClients = new Map<string, WebSocketClient>();

/**
 * Realiza un broadcast (difusión) de telemetría o eventos en tiempo real a todos
 * los clientes de portal web conectados de forma activa vía WebSocket.
 * 
 * @param {string} event - Nombre identificador del evento (ej: 'command_result', 'device_reading').
 * @param {unknown} data - Payload del evento a difundir.
 */
export function broadcastToPortal(event: string, data: unknown) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const socket of portalClients) {
    if (socket.readyState === 1) { // OPEN
      socket.send(message);
    }
  }
}

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

/**
 * Registra el endpoint WebSocket `/ws` en el servidor Fastify.
 * Autentica conexiones entrantes mediante JWT (Bearer, Cookie o Query Param)
 * y las clasifica como conexiones de agente DCA o de portal web.
 *
 * @param fastify - Instancia del servidor Fastify.
 * @param db - Conexión Knex para validar estado del agente (mismo chequeo que `agentAuth`).
 * @param redis - Cliente Redis para verificar blacklist de tokens revocados.
 * @param agentService - Servicio de agentes para actualización de comandos.
 */
export async function registerWebSocket(fastify: FastifyInstance, db: Knex, redis: Redis, agentService: AgentService) {
  (fastify as unknown as {
    get(
      path: string,
      opts: unknown,
      handler: (connection: WebSocketClient, request: FastifyRequest) => Promise<void>
    ): void;
  }).get('/ws', { websocket: true }, async (connection: WebSocketClient, request: FastifyRequest) => {
    const socket = connection; // @fastify/websocket v11: connection IS the WebSocket directly

    let agentId: string | null = null;
    let user: WsJwtPayload | null = null;

    try {
      fastify.log.info(`Handshake WSS iniciado desde IP: ${request.ip}`);

      const authHeader = request.headers.authorization;
      const cookieToken = request.cookies?.stc_session;
      const queryToken = (request.query as Record<string, string>)?.token;

      if (authHeader) {
        await request.jwtVerify();
        user = request.user as WsJwtPayload;
      } else if (cookieToken) {
        user = fastify.jwt.verify<WsJwtPayload>(cookieToken);
      } else if (queryToken) {
        user = fastify.jwt.verify<WsJwtPayload>(queryToken);
      }

      if (!user) {
        fastify.log.warn('Conexión WSS rechazada: No se encontró token válido');
        socket.close(4001, 'Token requerido');
        return;
      }

      if (user.agentId) {
        agentId = user.agentId;

        // Mismo chequeo que agentAuth (REST): un agente revocado o con token en
        // blacklist no debe poder mantener un canal WSS vivo para recibir/enviar
        // comandos.
        const agent = await db('agents').where({ id: agentId }).select('status').first();
        if (!agent || agent.status === 'revoked') {
          fastify.log.warn(`Conexión WSS rechazada: agente ${agentId} no encontrado o revocado`);
          socket.close(4004, 'Agente no encontrado o revocado');
          return;
        }
        const blacklisted = await agentService.isBlacklisted(redis, agentId);
        if (blacklisted) {
          fastify.log.warn(`Conexión WSS rechazada: token de agente ${agentId} revocado`);
          socket.close(4001, 'Token revocado');
          return;
        }

        agentClients.set(agentId!, socket);
        fastify.log.info(`Agente ${agentId} conectado vía WSS`);
      } else if (user.role === 'portal') {
        portalClients.add(socket);
        fastify.log.info(`Cliente de Portal (${user.userId}) conectado vía WSS`);
      } else {
        socket.close(4003, 'Rol no permitido');
        return;
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      fastify.log.error(`Error en autenticación WSS: ${errMsg}`);
      socket.close(4001, 'No autorizado');
      return;
    }

    socket.send(JSON.stringify({
      event: 'connected',
      data: { message: 'STC Cloud WebSocket activo', role: agentId ? 'agent' : 'portal' }
    }));

    let pingInterval: ReturnType<typeof setInterval> | null = null;
    if (agentId) {
      pingInterval = setInterval(() => {
        if (socket.readyState === 1) {
          try {
            // Enviar ping nativo (control frame) para mantener activa la conexión en proxies y firewalls
            socket.ping();
          } catch {}
          try {
            // Data frame de compatibilidad
            socket.send(JSON.stringify({ event: 'ping' }));
          } catch {}
        } else {
          clearInterval(pingInterval!);
          pingInterval = null;
        }
      }, 8_000);
    }

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (agentId && msg.event === 'command_result') {
          if (msg.data && msg.data.id) {
            agentService.updateCommandResult(
              msg.data.id,
              msg.data.status === 'success' ? 'completed' : 'error',
              msg.data.result
            ).catch((e: unknown) => {
              const errMsg = e instanceof Error ? e.message : String(e);
              fastify.log.error(`[WS] Error actualizando comando ${msg.data.id}: ${errMsg}`);
            });
          }

          broadcastToPortal('command_result', {
            agentId,
            ...msg.data
          });
        }
      } catch {
        // ignorar mensajes malformados
      }
    });

    const closePromise = new Promise<void>((resolve) => {
      socket.once('close', resolve);
    });

    socket.on('close', () => {
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
      fastify.log.info(`WSS: Conexión cerrada (${agentId || 'portal'})`);
    });

    socket.on('error', (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error(`WSS Error: ${errMsg}`);
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
    });

    await closePromise;
  });
}
