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

    let agentId: string | null = null;
    let user: any = null;

    try {
      fastify.log.info(`Handshake WSS iniciado desde IP: ${request.ip}`);

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
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
      fastify.log.info(`WSS: Conexión cerrada (${agentId || 'portal'})`);
    });

    socket.on('error', (err: any) => {
      fastify.log.error(`WSS Error: ${err.message}`);
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
    });

    await closePromise;
  });
}
