import os from 'os';
import { log } from './Logger';

// --- IP Range Generator ---

export function* ipRange(start: string, end: string): Generator<string> {
  const toN  = (ip: string) => ip.split('.').reduce((a, p) => (a << 8) + +p, 0);
  const toIp = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  for (let i = toN(start); i <= toN(end); i++) yield toIp(i >>> 0);
}

/**
 * Materializa `ipRange()` hasta `cap` IPs — tope de seguridad independiente
 * de cualquier validación cloud (defensa en profundidad contra datos viejos
 * pre-validación, ediciones manuales de DB, o cualquier bypass). Antes de
 * esto, `ScanService.scan()` hacía `[...ipRange(range.start, range.end)]`
 * sin ningún límite: un rango mal cargado (ej. un /8 entero) materializaba
 * millones de IPs en memoria de una sola vez.
 *
 * `truncated` se detecta directamente (si el generador todavía tenía más
 * para dar al llegar al tope), no por coincidencia de límites — así el
 * caller puede loguear un WARN preciso.
 */
export function materializeRange(range: { start: string; end: string }, cap: number): { ips: string[]; truncated: boolean } {
  const ips: string[] = [];
  let truncated = false;
  for (const ip of ipRange(range.start, range.end)) {
    if (ips.length >= cap) { truncated = true; break; }
    ips.push(ip);
  }
  return { ips, truncated };
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
