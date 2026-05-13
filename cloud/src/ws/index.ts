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
  fastify.get('/ws', { websocket: true } as any, async (connection: any, request: any) => {
    const { socket } = connection;
    
    // 1. Identificación y Autenticación
    let agentId: string | null = null;
    try {
      fastify.log.info(`Handshake WSS iniciado desde IP: ${request.ip}`);
      
      // Verificar si el token viene en los headers
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        fastify.log.warn('Conexión WSS rechazada: Falta cabecera Authorization');
        socket.close(4001, 'Token requerido');
        return;
      }

      // Intentar verificar si es un Agente vía JWT
      await request.jwtVerify();
      const user = request.user as any;
      const tid = user.agentId as string;
      
      if (tid) {
        agentId = tid;
        agentClients.set(tid, socket);
        fastify.log.info(`Agente ${tid} autenticado y conectado vía WSS`);
      } else {
        portalClients.add(socket);
        fastify.log.info(`Cliente de Portal autenticado y conectado vía WSS`);
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
          broadcastToPortal('command_result', {
            agentId,
            ...msg.data
          });
        }
      } catch {
        // ignorar mensajes malformados
      }
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
  });
}
