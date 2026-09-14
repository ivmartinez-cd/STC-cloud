import { FastifyInstance, FastifyRequest } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AgentService } from '../modules/agents';
import { consumeWsTicket } from '../services/wsTicketService';
import { rejectAllPendingForAgent } from '../services/ewsProxyService';
import type { WebSocketClient, WsJwtPayload, PortalConn } from './state';
import { portalClients, agentClients } from './state';
import { wsRedisPub, WS_EWS_ONLINE_SET, WS_EWS_RESULT_CHANNEL, relayEwsResultLocally } from './redis-channels';
import { broadcastToPortal } from './redis-channels';

/** Mismos orígenes que el CORS de la API (`api/plugins.ts`): el portal configurado y los de desarrollo. */
const PORTAL_ORIGINS = new Set([process.env.PORTAL_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean) as string[]);

function isPortalOrigin(origin: string | undefined): boolean {
  return !!origin && PORTAL_ORIGINS.has(origin);
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
    let portalConn: PortalConn | null = null;
    let user: WsJwtPayload | null = null;

    try {
      fastify.log.info(`Handshake WSS iniciado desde IP: ${request.ip}`);

      const authHeader = request.headers.authorization;
      const cookieToken = request.cookies?.stc_session;
      const queryTicket = (request.query as Record<string, string>)?.token;

      if (authHeader) {
        await request.jwtVerify();
        user = request.user as WsJwtPayload;
      } else if (cookieToken) {
        // La cookie sólo vale si la conexión la abre el propio portal: el
        // navegador manda la cookie de sesión en un `new WebSocket()` iniciado
        // desde CUALQUIER sitio (CORS no aplica a WebSocket), y sin este
        // chequeo un sitio ajeno visitado por un operador logueado recibía el
        // broadcast del portal (auditoría de seguridad, 14/09/2026).
        if (!isPortalOrigin(request.headers.origin)) {
          fastify.log.warn(`Conexión WSS con cookie rechazada: Origin no permitido (${request.headers.origin ?? 'ausente'})`);
          socket.close(4003, 'Origen no permitido');
          return;
        }
        user = fastify.jwt.verify<WsJwtPayload>(cookieToken);
      } else if (queryTicket) {
        // Ticket de un solo uso (`POST /portal/ws-ticket`), NO el JWT de sesión:
        // el portal en Vercel conecta directo contra Render (Vercel no proxea
        // WS), y la cookie de sesión no cruza de dominio en ese handshake.
        user = await consumeWsTicket(redis, queryTicket);
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
        wsRedisPub.sadd(WS_EWS_ONLINE_SET, agentId!).catch(() => {});
        fastify.log.info(`Agente ${agentId} conectado vía WSS`);
      } else if (user.role === 'portal') {
        // A diferencia de antes, se carga la fila del usuario (mismo criterio que
        // `portalAuth` en REST): un usuario desactivado no debe poder abrir/mantener
        // un canal WSS, y acá es también donde se resuelve el `client_id` para poder
        // excluirlo de `broadcastToPortal`.
        const dbUser = user.userId
          ? await db('users').where({ id: user.userId }).select('active', 'role', 'client_id').first()
          : null;
        if (!dbUser || !dbUser.active) {
          fastify.log.warn(`Conexión WSS rechazada: usuario ${user.userId} no encontrado o desactivado`);
          socket.close(4001, 'Usuario no encontrado o desactivado');
          return;
        }
        portalConn = { socket, role: dbUser.role, clientId: dbUser.client_id ?? null };
        portalClients.add(portalConn);
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
          } catch { /* socket cerrándose entre el readyState y el ping: lo limpia el close */ }
          try {
            // Data frame de compatibilidad
            socket.send(JSON.stringify({ event: 'ping' }));
          } catch { /* ídem: el close handler limpia el intervalo */ }
        } else {
          clearInterval(pingInterval!);
          pingInterval = null;
        }
      }, 8_000);
    }

    const updateCommandResultSafely = (data: { id: string; status?: string; result?: Record<string, unknown> | null }) => {
      agentService.updateCommandResult(data.id, agentId!, data.status === 'success' ? 'completed' : 'error', data.result ?? null)
        .catch((e: unknown) => {
          const errMsg = e instanceof Error ? e.message : String(e);
          fastify.log.error(`[WS] Error actualizando comando ${data.id}: ${errMsg}`);
        });
    };

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (agentId && msg.event === 'command_result') {
          // EWS_REQUEST no se persiste en `agent_commands` (una pantalla del
          // EWS son decenas de pedidos; ver `RelayEwsRequestUseCase`), así que
          // el UPDATE de abajo no tendría fila que tocar: se resuelve primero
          // y se corta acá, sin una query inútil por cada imagen de la página.
          //
          // EWS_PROXY y EWS_REQUEST se resuelven DIRECTO contra la request
          // HTTP que los pidió (ver `ewsProxyService.ts`) — nunca por
          // `broadcastToPortal`: ese canal manda cualquier command_result a
          // TODOS los portales admin/operator conectados, y el contenido de la
          // EWS de un cliente sólo debe llegar a quien lo pidió. Se publica
          // SIEMPRE por `stc:ws:ews-result` (aunque el agente esté conectado
          // acá) porque la request HTTP que espera este resultado puede estar
          // en OTRA réplica (relay, ver bloque de arriba); la propia
          // suscripción entrega localmente también con una sola réplica.
          if ((msg.data?.type === 'EWS_PROXY' || msg.data?.type === 'EWS_REQUEST') && msg.data?.id) {
            const resultMsg = JSON.stringify(
              msg.data.status === 'success'
                ? { commandId: msg.data.id, ok: true, value: msg.data.result }
                : { commandId: msg.data.id, ok: false, error: msg.data.result?.error || 'Error desconocido del agente' }
            );
            wsRedisPub.publish(WS_EWS_RESULT_CHANNEL, resultMsg).catch(() => relayEwsResultLocally(resultMsg));
            // EWS_PROXY sí tiene fila en `agent_commands` (el visor de una página la crea): se le guarda el resultado.
            if (msg.data.type === 'EWS_PROXY') updateCommandResultSafely(msg.data);
            return;
          }

          if (msg.data && msg.data.id) updateCommandResultSafely(msg.data);

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

    // Nunca dejar una request de EWS_PROXY colgada hasta el timeout si ya
    // sabemos que el agente se desconectó — local YA (rejectAllPendingForAgent
    // cubre esta réplica) y relayeado (otra réplica puede tener la promesa
    // pendiente de verdad, si el push se hizo por relay).
    function disconnectAgent(id: string): void {
      agentClients.delete(id);
      wsRedisPub.srem(WS_EWS_ONLINE_SET, id).catch(() => {});
      rejectAllPendingForAgent(id);
      wsRedisPub.publish(WS_EWS_RESULT_CHANNEL, JSON.stringify({ kind: 'disconnect', agentId: id })).catch(() => {});
    }

    socket.on('close', () => {
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) disconnectAgent(agentId);
      else if (portalConn) portalClients.delete(portalConn);
      fastify.log.info(`WSS: Conexión cerrada (${agentId || 'portal'})`);
    });

    socket.on('error', (err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      fastify.log.error(`WSS Error: ${errMsg}`);
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) disconnectAgent(agentId);
      else if (portalConn) portalClients.delete(portalConn);
    });

    await closePromise;
  });
}
