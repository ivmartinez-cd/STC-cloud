import net from 'net';
import os from 'os';

/**
 * STC Cloud Console - Diagnostic Engine
 * Motor local para ejecución de comandos técnicos avanzados.
 */

const PORT = 8000;
const ENGINE_NAME = 'STC Cloud Console Engine';
const VERSION = '1.1.0';

const server = net.createServer((socket) => {
  console.log(`[${ENGINE_NAME}] Conexión de diagnóstico recibida.`);

  socket.on('data', async (data) => {
    const command = data.toString().trim().toLowerCase();
    console.log(`[${ENGINE_NAME}] Ejecutando: ${command}`);

    let response = '';

    switch (command) {
      case 'status':
        response = JSON.stringify({
          engine: ENGINE_NAME,
          version: VERSION,
          status: 'online',
          system: {
            platform: process.platform,
            hostname: os.hostname(),
            uptime: Math.floor(process.uptime()),
            time: new Date().toISOString()
          }
        }, null, 2);
        break;

      case 'ping':
        response = `ACK - ${ENGINE_NAME} operativo y respondiendo.`;
        break;

      case 'help':
        response = 'Comandos de STC Console: status, ping, help, snmp-check';
        break;

      default:
        response = `Error: El comando '${command}' no es reconocido por la consola local de STC Cloud.`;
        break;
    }

    socket.write(response + '\n');
    socket.end();
  });

  socket.on('error', (err) => {
    console.error(`[${ENGINE_NAME}] Error:`, err.message);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('=========================================');
  console.log(`     ${ENGINE_NAME.toUpperCase()}     `);
  console.log(` Puerto: ${PORT} | Host: 127.0.0.1 `);
  console.log('=========================================');
});
