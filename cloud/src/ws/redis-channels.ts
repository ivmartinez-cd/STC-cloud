import Redis from 'ioredis';
import { resolveEwsProxy, rejectEwsProxy, rejectAllPendingForAgent } from '../services/ewsProxyService';
import { portalClients, agentClients, sendCommandToAgent } from './state';

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
export const WS_BROADCAST_CHANNEL = "stc:ws:portal";

// Único dueño de estas 2 conexiones — todo lo demás las importa de acá, nunca
// crea las suyas propias (evita duplicar la suscripción pub/sub).
export const wsRedisPub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
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
export const WS_EWS_ONLINE_SET = "stc:ws:ews-online";
export const WS_EWS_PUSH_CHANNEL = "stc:ws:ews-push";
export const WS_EWS_RESULT_CHANNEL = "stc:ws:ews-result";

/** Comandos que viajan por el relay síncrono: el visor de una página (`EWS_PROXY`) y el gateway navegable (`EWS_REQUEST`). */
export type EwsCommandType = 'EWS_PROXY' | 'EWS_REQUEST';

function relayEwsPushLocally(message: string): void {
  try {
    const { agentId, commandId, payload, type } = JSON.parse(message);
    // El default cubre el mensaje publicado por una réplica todavía sin
    // `type` (deploy rolling): antes de `EWS_REQUEST` esto era siempre EWS_PROXY.
    sendCommandToAgent(agentId, type ?? 'EWS_PROXY', payload, commandId); // no-op si el socket tampoco está acá
  } catch { /* mensaje corrupto, ignorar */ }
}

export function relayEwsResultLocally(message: string): void {
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
export async function pushEwsProxyCommand(
  agentId: string,
  commandId: string,
  payload: Record<string, unknown>,
  type: EwsCommandType = 'EWS_PROXY'
): Promise<boolean> {
  if (sendCommandToAgent(agentId, type, payload, commandId)) return true;
  const onlineElsewhere = await wsRedisPub.sismember(WS_EWS_ONLINE_SET, agentId).catch(() => 0);
  if (!onlineElsewhere) return false;
  await wsRedisPub.publish(WS_EWS_PUSH_CHANNEL, JSON.stringify({ agentId, commandId, payload, type })).catch(() => {});
  return true;
}

wsRedisSub.subscribe(WS_BROADCAST_CHANNEL, WS_EWS_PUSH_CHANNEL, WS_EWS_RESULT_CHANNEL).catch(() => {});
wsRedisSub.on("message", (channel, message) => {
  if (channel === WS_BROADCAST_CHANNEL) deliverToLocalPortals(message);
  else if (channel === WS_EWS_PUSH_CHANNEL) relayEwsPushLocally(message);
  else if (channel === WS_EWS_RESULT_CHANNEL) relayEwsResultLocally(message);
});

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
