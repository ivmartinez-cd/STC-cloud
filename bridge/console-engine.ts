import net from 'net';
import os from 'os';

/**
 * STC Cloud Console - Diagnostic Engine
 * Motor local para ejecución de comandos técnicos avanzados.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORT = 8000;
const ENGINE_NAME = 'STC Cloud Console Engine';
const VERSION = '1.2.0';

function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

const server = net.createServer((socket) => {
  console.log(`[${ENGINE_NAME}] Conexión de diagnóstico recibida.`);

  socket.on('data', async (data) => {
    const input = data.toString().trim();
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    console.log(`[${ENGINE_NAME}] Ejecutando: ${command} ${args.join(' ')}`);

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
          response = `ACK - ${ENGINE_NAME} operativo y respondiendo.`;
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
            try {
              const { stdout } = await execAsync(`ping -n 2 ${target}`);
              response += `[+] Red: El dispositivo responde a PING.\n`;
            } catch {
              response += `[-] Red: El dispositivo NO responde a PING.\n`;
            }
            const ports = [{p:9100,n:'RAW'}, {p:80,n:'Web'}, {p:443,n:'SSL'}, {p:161,n:'SNMP'}];
            for (const p of ports) {
              const open = await checkPort(target, p.p);
              response += `[${open ? '+' : '-'}] Puerto ${p.p} (${p.n}): ${open ? 'ABIERTO' : 'CERRADO'}\n`;
            }
            response += `------------------------------------------\n`;
          }
        } else {
          response = 'Error: Se requiere IP.';
        }
        break;

      case 'help':
        response = 'Comandos: status, ping [ip], check-printer [ip], help';
        break;

      default:
        response = `Error: El comando '${command}' no es reconocido.`;
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
