import net from 'net';
import { log } from '../core/Logger';

const PJL_PORT    = 9100;
const PJL_TIMEOUT = 3000;
// Detección de "PJL deshabilitado" (firewall/driver del equipo bloqueando el
// puerto 9100, o firmware con PJL apagado) — no había ningún log/flag
// específico antes, un fallo de PJL se trataba igual que cualquier otro
// método sin datos. Contador en memoria (se resetea al reiniciar el
// servicio; no vale la pena persistirlo, es sólo diagnóstico) por IP,
// consecutivo — se resetea apenas un intento SÍ responde.
const PJL_DISABLED_THRESHOLD = 3;
const pjlConsecutiveFailures = new Map<string, number>();

export interface PjlData {
  totalPages: number | null;
  model:      string | null;
  serial:     string | null;
}

const UEL = '\x1b%-12345X';
const PJL_CMD =
  `${UEL}@PJL\r\n` +
  `@PJL INFO ID\r\n` +
  `@PJL INFO SERIALNUMBER\r\n` +
  `@PJL INFO PAGECOUNT\r\n` +
  `${UEL}`;

/** Sólo para tests — inspecciona/resetea el contador en memoria de fallos consecutivos por IP. */
export function getPjlConsecutiveFailures(ip: string): number {
  return pjlConsecutiveFailures.get(ip) ?? 0;
}
export function resetPjlFailureTracking(): void {
  pjlConsecutiveFailures.clear();
}

/** `port`/`timeoutMs` son parametrizables sólo para poder testear con un servidor TCP local rápido — en producción siempre son PJL_PORT/PJL_TIMEOUT, ningún caller real los pasa. */
export function readDeviceViaPJL(ip: string, port: number = PJL_PORT, timeoutMs: number = PJL_TIMEOUT): Promise<PjlData | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let raw = '';
    let settled = false;

    const finish = (result: PjlData | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();

      if (result === null) {
        const failures = (pjlConsecutiveFailures.get(ip) ?? 0) + 1;
        pjlConsecutiveFailures.set(ip, failures);
        if (failures === PJL_DISABLED_THRESHOLD) {
          log('WARN', `[${ip}] PJL parece deshabilitado (${failures} intentos consecutivos sin respuesta en puerto ${port})`);
        }
      } else if (pjlConsecutiveFailures.has(ip)) {
        pjlConsecutiveFailures.delete(ip);
      }

      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => socket.write(PJL_CMD, 'binary'));
    socket.on('data', (chunk: Buffer) => { raw += chunk.toString('ascii'); });
    socket.once('timeout', () => finish(raw.length > 0 ? parsePjl(raw) : null));
    socket.once('close',   () => finish(raw.length > 0 ? parsePjl(raw) : null));
    socket.once('error',   () => finish(null));
    socket.connect(port, ip);
  });
}

function parsePjl(data: string): PjlData | null {
  if (!data.includes('@PJL')) return null;

  const modelMatch = data.match(/INFO\s+ID\s*=\s*"?([^\r\n"]+)"?/i) ?? 
                     data.match(/INFO\s+ID\s*[\r\n]+\s*"?([^\r\n"]+)"?/i);

  const pageMatch = data.match(/PAGECOUNT\s*=\s*(\d+)/i) ?? 
                    data.match(/PAGECOUNT\s*[\r\n]+\s*(\d+)/i);

  const serialMatch = data.match(/SERIALNUMBER\s*=\s*"?([^\s\r\n"]+)"?/i) ?? 
                      data.match(/SERIALNUMBER\s*[\r\n]+\s*"?([^\s\r\n"]+)"?/i);

  const totalPages = pageMatch ? parseInt(pageMatch[1], 10) : null;
  const model = modelMatch ? modelMatch[1].trim() : null;
  const serial = serialMatch ? serialMatch[1].trim() : null;

  if (totalPages === null && model === null && serial === null) return null;
  return { totalPages, model, serial };
}
