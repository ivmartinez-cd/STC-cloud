import net from 'net';
import os from 'os';

/**
 * STC Cloud Console - Diagnostic Engine
 * Motor local para ejecución de comandos técnicos avanzados.
 */
export class ConsoleEngine {
  private server: net.Server;
  private port: number;
  private engineName: string = 'STC Cloud Console Engine';
  private version: string = '1.1.0';

  constructor(port = 8000) {
    this.port = port;
    this.server = net.createServer((socket) => {
      socket.on('data', async (data) => {
        const command = data.toString().trim().toLowerCase();
        let response = '';

        switch (command) {
          case 'status':
            response = JSON.stringify({
              engine: this.engineName,
              version: this.version,
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
            response = `ACK - ${this.engineName} operativo y respondiendo.`;
            break;

          case 'help':
            response = 'Comandos de STC Console: status, ping, help';
            break;

          default:
            response = `Error: El comando '${command}' no es reconocido por la consola local de STC Cloud.`;
            break;
        }

        socket.write(response + '\n');
        socket.end();
      });

      socket.on('error', (err) => {
        // Silenciamos errores de socket individuales
      });
    });
  }

  start() {
    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[${this.engineName}] Puerto ${this.port} en uso. Reintentando en 30s...`);
        setTimeout(() => this.start(), 30000);
      } else {
        console.error(`[${this.engineName}] Error crítico: ${err.message}`);
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[${this.engineName}] Escuchando en el puerto ${this.port}`);
    });
  }

  stop() {
    this.server.close();
  }
}
