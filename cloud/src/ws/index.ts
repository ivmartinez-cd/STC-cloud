import { FastifyInstance, FastifyRequest } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AgentService } from '../modules/agents';
import { consumeWsTicket } from '../services/wsTicketService';
import { resolveEwsProxy, rejectEwsProxy, rejectAllPendingForAgent } from '../services/ewsProxyService';
import { setWsCountsProvider } from '../modules/metrics/registry';

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

/** Conexión de portal ya resuelta contra la base (rol + cliente del usuario). */
interface PortalConn {
  socket: WebSocketClient;
  role: string;
  clientId: string | null;
}

// Almacena clientes conectados
const portalClients = new Set<PortalConn>();
const agentClients = new Map<string, WebSocketClient>();

// ─── Pub/sub Redis para broadcasts (Fase 5.4 de producción-readiness) ────────
//
// Con más de una réplica de la API, los sockets de portal quedan repartidos
// entre procesos: un broadcast local solo llegaría a los sockets de ESTA
// réplica. Todo `broadcastToPortal` se publica a un canal Redis y CADA
// réplica (incluida la que publicó) lo entrega a sus sockets locales al
// recibirlo por la suscripción — un solo camino de entrega, sin duplicados.
// Si el publish falla (Redis caído), se entrega localmente como fallback:
// mejor que los operadores de esta réplica lo vean a que no lo vea nadie.
//
// Lo que NO cubre esto: los canales con afinidad de socket (comandos push a
// un agente puntual). Ahí el fallback replica-agnóstico ya existe — la
// entrega de comandos por polling de heartbeat. El proxy EWS SÍ tiene su
// propio relay (ver bloque siguiente, Fase 15 del gap analysis) porque es
// síncrono y no puede esperar al próximo heartbeat.
const WS_BROADCAST_CHANNEL = "stc:ws:portal";

const wsRedisPub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryStrategy() { return 10000; },
});
const wsRedisSub = wsRedisPub.duplicate();

function deliverToLocalPortals(message: string): void {
  for (const conn of portalClients) {
    if (conn.clientId !== null) continue;
    if (conn.socket.readyState === 1) { // OPEN
      conn.socket.send(message);
    }
  }
}

// ─── Relay EWS proxy multi-réplica (Fase 15 del gap analysis) ────────────────
//
// El proxy EWS remoto (`ewsProxyService.ts`) es síncrono: la request HTTP del
// portal queda esperando hasta que el agente responde por WSS. Antes de esta
// fase, ese round-trip sólo funcionaba si el socket del agente estaba en la
// MISMA réplica que recibió la request — con >1 réplica, un agente conectado
// a la réplica B era indistinguible de "no conectado" para una request que
// cayó en la réplica A (503 inmediato, incorrecto).
//
// Tres piezas, mismo patrón que el broadcast de portal:
// 1. `stc:ws:ews-online` (SET Redis): qué agentes están conectados a ALGUNA
//    réplica ahora mismo — se actualiza al conectar/desconectar. Permite
//    seguir fallando rápido (503, sin esperar nada) cuando el agente no está
//    conectado a NINGUNA réplica, que es el caso común y el que cubren los
//    tests existentes contra un solo proceso.
// 2. `stc:ws:ews-push` (pub/sub): si el agente está online mundo, pero no en
//    ESTA réplica, se publica el pedido de push — la réplica dueña del
//    socket lo entrega.
// 3. `stc:ws:ews-result` (pub/sub): el `command_result`/la desconexión se
//    publican SIEMPRE acá (no sólo resueltos localmente) — cada réplica que
//    tenga una promesa pendiente para ese `commandId` la resuelve al recibir
//    el mensaje (no-op si no la tiene, mismo criterio idempotente que ya
//    tenía `ewsProxyService.ts`).
const WS_EWS_ONLINE_SET = "stc:ws:ews-online";
const WS_EWS_PUSH_CHANNEL = "stc:ws:ews-push";
const WS_EWS_RESULT_CHANNEL = "stc:ws:ews-result";

function relayEwsPushLocally(message: string): void {
  try {
    const { agentId, commandId, payload } = JSON.parse(message);
    sendCommandToAgent(agentId, 'EWS_PROXY', payload, commandId); // no-op si el socket tampoco está acá
  } catch { /* mensaje corrupto, ignorar */ }
}

function relayEwsResultLocally(message: string): void {
  try {
    const parsed = JSON.parse(message);
    if (parsed.kind === 'disconnect') rejectAllPendingForAgent(parsed.agentId);
    else if (parsed.ok) resolveEwsProxy(parsed.commandId, parsed.value);
    else rejectEwsProxy(parsed.commandId, parsed.error);
  } catch { /* mensaje corrupto, ignorar */ }
}

/**
 * Empuja un comando EWS_PROXY al agente: local si el socket está en esta
 * réplica, o relay por Redis si está en otra. `false` sólo cuando el agente
 * no está conectado a NINGUNA réplica (fail-fast real, sin esperar) — a
 * diferencia de un `false` de `sendCommandToAgent` a secas, que hoy sólo
 * significa "no en ESTA réplica".
 */
export async function pushEwsProxyCommand(agentId: string, commandId: string, payload: Record<string, unknown>): Promise<boolean> {
  if (sendCommandToAgent(agentId, 'EWS_PROXY', payload, commandId)) return true;
  const onlineElsewhere = await wsRedisPub.sismember(WS_EWS_ONLINE_SET, agentId).catch(() => 0);
  if (!onlineElsewhere) return false;
  await wsRedisPub.publish(WS_EWS_PUSH_CHANNEL, JSON.stringify({ agentId, commandId, payload })).catch(() => {});
  return true;
}

wsRedisSub.subscribe(WS_BROADCAST_CHANNEL, WS_EWS_PUSH_CHANNEL, WS_EWS_RESULT_CHANNEL).catch(() => {});
wsRedisSub.on("message", (channel, message) => {
  if (channel === WS_BROADCAST_CHANNEL) deliverToLocalPortals(message);
  else if (channel === WS_EWS_PUSH_CHANNEL) relayEwsPushLocally(message);
  else if (channel === WS_EWS_RESULT_CHANNEL) relayEwsResultLocally(message);
});

/** Conteo de conexiones vivas para la métrica `stc_ws_connections`. */
export function wsConnectionCounts(): { agents: number; portals: number } {
  return { agents: agentClients.size, portals: portalClients.size };
}
setWsCountsProvider(wsConnectionCounts);

/**
 * Realiza un broadcast (difusión) de telemetría o eventos en tiempo real a los
 * clientes de portal web conectados de forma activa vía WebSocket.
 *
 * Los sockets de un `client_viewer` (clientId no nulo) NUNCA reciben nada acá: hoy el
 * único evento es `command_result` (resultado de comandos remotos a agentes), y un
 * client_viewer no puede ejecutar comandos — no tiene ningún uso legítimo de este
 * evento, así que se falla cerrado en vez de resolver a qué cliente pertenece el
 * agente en cada broadcast. Cuando haga falta un evento por cliente, el handshake ya
 * consulta `agents` para agentClients — alcanza con sumar `client_id` a ese select.
 *
 * @param {string} event - Nombre identificador del evento (ej: 'command_result', 'device_reading').
 * @param {unknown} data - Payload del evento a difundir.
 */
export function broadcastToPortal(event: string, data: unknown) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  // Publicar; la entrega local la hace la suscripción (ver bloque pub/sub).
  wsRedisPub.publish(WS_BROADCAST_CHANNEL, message).catch(() => {
    deliverToLocalPortals(message);
  });
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

          // EWS_PROXY se resuelve DIRECTO contra la request HTTP que lo pidió
          // (ver `ewsProxyService.ts`) — nunca por `broadcastToPortal`: ese
          // canal manda cualquier command_result a TODOS los portales
          // admin/operator conectados, y el contenido de la EWS de un
          // cliente sólo debe llegar a quien lo pidió. Se publica SIEMPRE por
          // `stc:ws:ews-result` (aunque el agente esté conectado acá) porque
          // la request HTTP que espera este resultado puede estar en OTRA
          // réplica (relay, ver bloque de arriba); la propia suscripción
          // entrega localmente también en el caso de una sola réplica.
          if (msg.data?.type === 'EWS_PROXY' && msg.data?.id) {
            const resultMsg = JSON.stringify(
              msg.data.status === 'success'
                ? { commandId: msg.data.id, ok: true, value: msg.data.result }
                : { commandId: msg.data.id, ok: false, error: msg.data.result?.error || 'Error desconocido del agente' }
            );
            wsRedisPub.publish(WS_EWS_RESULT_CHANNEL, resultMsg).catch(() => relayEwsResultLocally(resultMsg));
            return;
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
