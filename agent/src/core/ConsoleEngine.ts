import net from 'net';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * STC Cloud Console - Diagnostic Engine
 * Motor local para ejecución de comandos técnicos avanzados.
 */
export class ConsoleEngine {
  private server: net.Server;
  private port: number;
  private engineName: string = 'STC Cloud Console Engine';
  private version: string = '1.2.0';

  constructor(port = 8000) {
    this.port = port;
    this.server = net.createServer((socket) => {
      socket.on('data', async (data) => {
        const input = data.toString().trim();
        const parts = input.split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
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
            if (args.length > 0) {
              const target = args[0];
              if (!/^[a-zA-Z0-9.-]+$/.test(target)) {
                response = 'Error: Dirección IP o Hostname inválido.';
              } else {
                try {
                  const { stdout } = await execAsync(`ping -n 4 ${target}`);
                  response = stdout;
                } catch (error: any) {
                  response = `Error haciendo ping a ${target}:\n${error.stdout || error.message}`;
                }
              }
            } else {
              response = `ACK - ${this.engineName} operativo y respondiendo.`;
            }
            break;

          case 'check-printer':
          case 'ping-printer':
            if (args.length > 0) {
              const target = args[0];
              if (!/^[a-zA-Z0-9.-]+$/.test(target)) {
                response = 'Error: Dirección IP o Hostname inválido.';
              } else {
                response = `DIAGNÓSTICO DE IMPRESORA: ${target}\n`;
                response += `------------------------------------------\n`;
                
                // 1. Ping
                try {
                  const { stdout } = await execAsync(`ping -n 2 ${target}`);
                  response += `[+] Red: El dispositivo responde a PING.\n`;
                } catch {
                  response += `[-] Red: El dispositivo NO responde a PING.\n`;
                }

                // 2. Puertos comunes
                const ports = [
                  { p: 9100, n: 'RAW/JetDirect' },
                  { p: 80,   n: 'Web (HTTP)' },
                  { p: 443,  n: 'Web (HTTPS)' },
                  { p: 161,  n: 'SNMP' }
                ];

                for (const portInfo of ports) {
                  const isOpen = await this.checkPort(target, portInfo.p);
                  response += `[${isOpen ? '+' : '-'}] Puerto ${portInfo.p} (${portInfo.n}): ${isOpen ? 'ABIERTO' : 'CERRADO'}\n`;
                }

                response += `------------------------------------------\n`;
                response += `Diagnóstico finalizado.`;
              }
            } else {
              response = 'Error: Se requiere una dirección IP para diagnosticar. Ejemplo: check-printer 192.168.1.50';
            }
            break;

          case 'help':
            response = `Comandos de STC Console:
 - status: Información del motor local
 - ping [ip]: Realiza un ping estándar
 - check-printer [ip]: Diagnóstico completo de puertos de impresora
 - clear: Limpia la pantalla (solo en portal)
 - help: Muestra esta ayuda`;
            break;

          default:
            response = `Error: El comando '${command}' no es reconocido. Use 'help' para ver los comandos disponibles.`;
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

  private checkPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1500);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
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
