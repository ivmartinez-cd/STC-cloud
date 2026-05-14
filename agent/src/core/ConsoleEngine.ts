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
                response = '❌ IP inválida';
              } else {
                try {
                  const { stdout } = await execAsync(`ping -n 2 ${target}`);
                  const hasResponse = stdout.toLowerCase().includes('respuesta') || stdout.toLowerCase().includes('reply');
                  response = `Respuesta: ${hasResponse ? '✅ ONLINE' : '❌ OFFLINE'}`;
                } catch (error: any) {
                  response = `Respuesta: ❌ OFFLINE`;
                }
              }
            } else {
              response = `💡 Uso: ping <ip>`;
            }
            break;

          case 'snmp-check':
            if (args.length > 0) {
              const target = args[0];
              const community = args[1] || 'public';
              if (!/^[a-zA-Z0-9.-]+$/.test(target)) {
                response = '❌ IP inválida';
              } else {
                try {
                  const { readDevice } = require('../snmp/scanner');
                  response = `📡 [CONSULTA SNMP] -> ${target}\n`;
                  response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                  
                  const data = await readDevice(target, community);
                  
                  if (!data) {
                    response += `❌ El dispositivo no respondió a SNMP v2c\n`;
                    response += `💡 Tip: Verifica que la comunidad sea '${community}' y el puerto 161 esté abierto.`;
                  } else {
                    response += `🏷️  Marca:   ${data.brand.toUpperCase()}\n`;
                    response += `📦 Modelo:  ${data.model}\n`;
                    response += `🔢 Serial:  ${data.serial || 'No disponible'}\n`;
                    response += `----------------------------\n`;
                    response += `📄 TOTAL:   ${data.total_pages ?? 'N/D'}\n`;
                    response += `⚫ MONO:    ${data.mono_pages ?? 'N/D'}\n`;
                    response += `🌈 COLOR:   ${data.color_pages ?? 'N/D'}\n`;
                    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    response += `✅ Datos STC recuperados correctamente.`;
                  }
                } catch (error: any) {
                  response = `❌ Error SNMP: ${error.message}`;
                }
              }
            } else {
              response = '❌ Uso: snmp-check <ip> [comunidad]';
            }
            break;

          case 'help':
            response = `Comandos de STC Console:
 - status: Estado del motor
 - ping <ip>: Test de red rápido
 - snmp-check <ip>: Lectura de contadores/serial
 - clear: Limpiar consola
 - help: Ver esta ayuda`;
            break;

          default:
            response = `❌ Comando no reconocido. Usa 'help'.`;
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
