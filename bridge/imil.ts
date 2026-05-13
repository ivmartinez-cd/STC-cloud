import net from 'net';
import os from 'os';

/**
 * STC Diagnostic Bridge (IMIL Service)
 * Escucha en el puerto 8000 para procesar comandos técnicos del agente.
 */

const PORT = 8000;
const VERSION = '1.0.0-imil';

const server = net.createServer((socket) => {
  console.log(`[IMIL] Conexión recibida desde ${socket.remoteAddress}`);

  socket.on('data', async (data) => {
    const command = data.toString().trim().toLowerCase();
    console.log(`[IMIL] Ejecutando comando: ${command}`);

    let response = '';

    switch (command) {
      case 'status':
        response = JSON.stringify({
          version: VERSION,
          status: 'online',
          platform: process.platform,
          arch: process.arch,
          hostname: os.hostname(),
          uptime: Math.floor(process.uptime()),
          memory: process.memoryUsage().heapUsed,
          time: new Date().toISOString()
        }, null, 2);
        break;

      case 'ping':
        response = 'PONG - Servidor de diagnóstico respondiendo correctamente.';
        break;

      case 'help':
        response = 'Comandos disponibles: status, ping, help, debug';
        break;

      default:
        response = `Error: Comando '${command}' no reconocido por el motor de diagnóstico STC.`;
        break;
    }

    socket.write(response + '\n');
    // Cerramos después de responder (estilo SDS)
    socket.end();
  });

  socket.on('error', (err) => {
    console.error('[IMIL] Error en socket:', err.message);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('=========================================');
  console.log(` STC Diagnostic Bridge (IMIL) ACTIVO `);
  console.log(` Puerto: ${PORT} | Host: 127.0.0.1 `);
  console.log('=========================================');
});
