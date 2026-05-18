import { FastifyInstance } from 'fastify';

// Almacena clientes conectados
const portalClients = new Set<any>();
const agentClients = new Map<string, any>();

export function broadcastToPortal(event: string, data: unknown) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const socket of portalClients) {
    if (socket.readyState === 1) { // OPEN
      socket.send(message);
    }
  }
}

export function sendCommandToAgent(agentId: string, commandType: string, payload: any = {}, commandId?: string) {
  const socket = agentClients.get(agentId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'command', id: commandId, commandType, payload }));
    return true;
  }
  return false;
}

export async function registerWebSocket(fastify: FastifyInstance, agentService: any) {
  fastify.get('/ws', { websocket: true } as any, async (connection: any, request: any) => {
    const { socket } = connection;
    
      // 1. Identificación y Autenticación
      let agentId: string | null = null;
      let user: any = null;

      try {
        fastify.log.info(`Handshake WSS iniciado desde IP: ${request.ip}`);
        
        // El token puede venir en:
        // 1. Header Authorization (Agentes)
        // 2. Cookie stc_session (Portal)
        // 3. Query Parameter token (Navegadores fallback)
        
        const authHeader = request.headers.authorization;
        const cookieToken = request.cookies?.stc_session;
        const queryToken = (request.query as any)?.token;

        if (authHeader) {
          await request.jwtVerify();
          user = request.user;
        } else if (cookieToken) {
          user = fastify.jwt.verify(cookieToken);
        } else if (queryToken) {
          user = fastify.jwt.verify(queryToken);
        }

        if (!user) {
          fastify.log.warn('Conexión WSS rechazada: No se encontró token válido');
          socket.close(4001, 'Token requerido');
          return;
        }

        if (user.agentId) {
          agentId = user.agentId;
          agentClients.set(agentId!, socket);
          fastify.log.info(`Agente ${agentId} conectado vía WSS`);

          // Server-side heartbeat: Render.com closes idle connections after ~55s.
          // Ping every 20s so the TCP link stays alive regardless of traffic.
          const pingInterval = setInterval(() => {
            if (socket.readyState === 1) {
              socket.ping();
            } else {
              clearInterval(pingInterval);
            }
          }, 20_000);

          socket.once('close', () => clearInterval(pingInterval));
        } else if (user.role === 'portal') {
          portalClients.add(socket);
          fastify.log.info(`Cliente de Portal (${user.userId}) conectado vía WSS`);
        } else {
          socket.close(4003, 'Rol no permitido');
          return;
        }
      } catch (e: any) {
      fastify.log.error(`Error en autenticación WSS: ${e.message}`);
      socket.close(4001, 'No autorizado');
      return;
    }

    socket.send(JSON.stringify({
      event: 'connected',
      data: { message: 'STC Cloud WebSocket activo', role: agentId ? 'agent' : 'portal' }
    }));

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        // Si un agente envía el resultado de un comando, lo retransmitimos al portal
        if (agentId && msg.event === 'command_result') {
          // Si el resultado trae ID, marcar como completado en DB para evitar duplicidad vía heartbeat
          if (msg.data && msg.data.id) {
            agentService.updateCommandResult(
              msg.data.id, 
              msg.data.status === 'success' ? 'completed' : 'error', 
              msg.data.result
            ).catch((e: any) => fastify.log.error(`[WS] Error actualizando comando ${msg.data.id}: ${e.message}`));
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
      socket.once('close', () => {
        resolve();
      });
    });

    socket.on('close', () => {
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
      fastify.log.info(`WSS: Conexión cerrada (${agentId || 'portal'})`);
    });

    socket.on('error', (err: any) => {
      fastify.log.error(`WSS Error: ${err.message}`);
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
    });

    await closePromise;
  });
}
