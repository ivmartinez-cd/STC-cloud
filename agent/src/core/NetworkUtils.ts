import os from 'os';
import dns from 'dns';
import { log } from './Logger';

// --- IP Range Generator ---

export function* ipRange(start: string, end: string): Generator<string> {
  const toN  = (ip: string) => ip.split('.').reduce((a, p) => (a << 8) + +p, 0);
  const toIp = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  for (let i = toN(start); i <= toN(end); i++) yield toIp(i >>> 0);
}

// --- Hostname resolution (point lookup, §2.1/§2.3 gap analysis) ---

const DNS_LOOKUP_TIMEOUT_MS = 4000;

/** Seam de test: firma mínima de `dns.lookup` con las opciones que usamos
 *  (no reutiliza `typeof dns.lookup` porque sus overloads reales son más
 *  complejos de lo que necesitamos acá — un fake sólo tiene que matchear
 *  esta forma). */
type LookupFn = (
  hostname: string,
  options: { family: number; verbatim: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: string) => void
) => void;

/**
 * Resuelve un hostname a IPv4 con timeout explícito propio.
 * `dns.lookup()` no tiene timeout nativo en la API de Node y corre sobre el
 * mismo threadpool de libuv que usa `fs` (`UV_THREADPOOL_SIZE=4` default,
 * también usado para guardar `config.enc`) — sin este timeout, varios hosts
 * con DNS caído en el mismo ciclo podrían agotar el pool y bloquear I/O de
 * archivos no relacionado. `family:4` fuerza IPv4 (todo el pipeline de
 * captura/SNMP es IPv4-only); `verbatim:true` explícito para no depender del
 * default de ordenamiento de direcciones de `dns.lookup`, que cambió entre
 * versiones de Node. `null` cubre tanto un error real (NXDOMAIN, etc.) como
 * un timeout — el caller no necesita distinguirlos, ambos significan "no se
 * pudo resolver esta vez, probar de nuevo el próximo ciclo".
 */
export async function resolveHostname(
  hostname: string,
  timeoutMs = DNS_LOOKUP_TIMEOUT_MS,
  lookupFn: LookupFn = dns.lookup
): Promise<string | null> {
  const lookup = new Promise<string | null>((resolve) => {
    try {
      lookupFn(hostname, { family: 4, verbatim: true }, (err, address) => {
        resolve(err ? null : address);
      });
    } catch {
      resolve(null);
    }
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([lookup, timeout]);
}

function safeIpToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
}

const PRIVATE_BLOCKS: Array<[number, number]> = [
  [safeIpToInt('10.0.0.0'), safeIpToInt('10.255.255.255')],
  [safeIpToInt('172.16.0.0'), safeIpToInt('172.31.255.255')],
  [safeIpToInt('192.168.0.0'), safeIpToInt('192.168.255.255')],
  [safeIpToInt('127.0.0.0'), safeIpToInt('127.255.255.255')], // loopback
  [safeIpToInt('169.254.0.0'), safeIpToInt('169.254.255.255')], // link-local
];

/**
 * Mismo criterio que `cloud/src/services/ipRangeSpec.ts::isPrivateOrReserved`
 * (duplicado — no hay paquete compartido entre `agent/` y `cloud/`), pero
 * resuelto ACÁ porque sólo el agente conoce la IP real detrás de un
 * hostname resuelto — el cloud no puede chequearlo sin resolver la DNS
 * interna del cliente. Sólo informativo (WARN de log), nunca bloquea el scan.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const n = safeIpToInt(ip);
  return PRIVATE_BLOCKS.some(([s, e]) => n >= s && n <= e);
}

// --- System Info ---

export function getLocalIp(): string {
  const nets = os.networkInterfaces();
  const candidates: { ip: string; name: string; score: number }[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;

    const lowerName = name.toLowerCase();
    const isVirtual = lowerName.includes('vethernet') ||
                      lowerName.includes('wsl') ||
                      lowerName.includes('virtual') ||
                      lowerName.includes('vbox') ||
                      lowerName.includes('vmnet') ||
                      lowerName.includes('loopback') ||
                      lowerName.includes('bluetooth') ||
                      lowerName.includes('docker') ||
                      lowerName.includes('tap') ||
                      lowerName.includes('tun');

    for (const netInfo of netList) {
      if (netInfo.internal || netInfo.family !== 'IPv4') continue;

      const ip = netInfo.address;
      // Omitir loopback y direcciones APIPA/link-local (169.254.x.x)
      if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

      let score = 0;
      // Priorizar subredes locales privadas estándar
      if (ip.startsWith('192.168.')) score += 100;
      else if (ip.startsWith('10.')) score += 90;
      else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) score += 80;
      else score += 50;

      // Favorecer interfaces físicas reales sobre placas virtuales
      if (!isVirtual) score += 200;

      candidates.push({ ip, name, score });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].ip;
  }

  // Fallback si no hay interfaces físicas estándar
  for (const name of Object.keys(nets)) {
    for (const netInfo of nets[name] || []) {
      if (!netInfo.internal && netInfo.family === 'IPv4' && !netInfo.address.startsWith('127.')) {
        return netInfo.address;
      }
    }
  }

  return '127.0.0.1';
}

export function getHostOS(): string {
  const type = os.type();
  const release = os.release();
  const arch = os.arch();
  if (type === 'Windows_NT') {
    return `Windows ${release} (${arch})`;
  }
  return `${type} ${release} (${arch})`;
}

// --- Connectivity Check ---

export async function waitForConnectivity(serverUrl: string): Promise<void> {
  const url = `${serverUrl}/api/v1/health`;
  let delay = 10_000; // Arranca en 10s, dobla cada intento, techo 5 min

  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        log('INFO', 'Servidor alcanzable. Iniciando loops.');
        return;
      }
      log('WARN', `Servidor respondio HTTP ${res.status}. Reintentando en ${delay / 1000}s...`);
    } catch {
      log('WARN', `Servidor no alcanzable (puerto 443). Reintentando en ${delay / 1000}s (Exponential Backoff)...`);
    }
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 300_000);
  }
}
