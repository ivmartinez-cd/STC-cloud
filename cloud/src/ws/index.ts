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

export function sendCommandToAgent(agentId: string, commandType: string, payload: any = {}) {
  const socket = agentClients.get(agentId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ type: 'command', commandType, payload }));
    return true;
  }
  return false;
}

export async function registerWebSocket(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true } as any, async (socket: any, request: any) => {
    // 1. Identificación y Autenticación
    let agentId: string | null = null;
    try {
      // Intentar verificar si es un Agente vía JWT
      await request.jwtVerify();
      const user = request.user as any;
      if (user.agentId) {
        agentId = user.agentId;
        agentClients.set(agentId, socket);
        fastify.log.info(`Agente ${agentId} conectado vía WSS`);
      } else {
        portalClients.add(socket);
        fastify.log.info(`Cliente de Portal conectado vía WSS`);
      }
    } catch (e) {
      fastify.log.warn('Conexión WSS rechazada: No se pudo verificar identidad');
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
        // Manejar Pings/Eventos si es necesario
      } catch {
        // ignorar mensajes malformados
      }
    });

    socket.on('close', () => {
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
    });

    socket.on('error', () => {
      if (agentId) agentClients.delete(agentId);
      else portalClients.delete(socket);
    });
  });
}
