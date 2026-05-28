import os from 'os';
import { log } from './Logger';

// --- IP Range Generator ---

export function* ipRange(start: string, end: string): Generator<string> {
  const toN  = (ip: string) => ip.split('.').reduce((a, p) => (a << 8) + +p, 0);
  const toIp = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  for (let i = toN(start); i <= toN(end); i++) yield toIp(i >>> 0);
}

// --- System Info ---

export function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (netList) {
      for (const netInfo of netList) {
        if (!netInfo.internal && netInfo.family === 'IPv4') {
          return netInfo.address;
        }
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
