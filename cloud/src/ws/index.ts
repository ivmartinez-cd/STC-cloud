import { FastifyInstance } from 'fastify';

// Almacena clientes WebSocket del portal conectados
const portalClients = new Set<any>();

export function broadcastToPortal(event: string, data: unknown) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const socket of portalClients) {
    if (socket.readyState === 1) { // OPEN
      socket.send(message);
    }
  }
}

export async function registerWebSocket(fastify: FastifyInstance) {
  // Requiere: npm install @fastify/websocket
  // Y registrar el plugin en server.ts: fastify.register(require('@fastify/websocket'))
  fastify.get('/ws', { websocket: true } as any, (socket: any) => {
    portalClients.add(socket);

    socket.send(JSON.stringify({
      event: 'connected',
      data: { message: 'STC Cloud WebSocket activo' }
    }));

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ event: 'pong' }));
        }
      } catch {
        // ignorar mensajes malformados
      }
    });

    socket.on('close', () => {
      portalClients.delete(socket);
    });

    socket.on('error', () => {
      portalClients.delete(socket);
    });
  });
}
