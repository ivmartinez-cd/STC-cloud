import fs from 'fs';
import path from 'path';
import { ConfigManager, DATA_DIR, getHardwareId, type AgentConfig } from './config';
import { VERSION } from './version';

export async function printStatus(): Promise<void> {
  const { execSync } = await import('child_process');

  let serviceStatus = 'not-installed';
  try {
    const out = execSync('sc query STCCloudMonitor', {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Parseo robusto sin importar el idioma del Windows
    if (out.includes(' 4 ') || out.includes('RUNNING'))       serviceStatus = 'running';
    else if (out.includes(' 1 ') || out.includes('STOPPED'))  serviceStatus = 'stopped';
    else if (out.includes(' 2 ') || out.includes(' 3 ') || out.includes('PENDING')) serviceStatus = 'starting';
    else serviceStatus = 'unknown';
  } catch { /* servicio no registrado */ }

  let config: AgentConfig | null = null;
  let hardwareBindingIntegrity: 'ok' | 'hwid-mismatch' | 'config-missing' | 'decrypt-error' = 'config-missing';
  try {
    config = await ConfigManager.load();
    hardwareBindingIntegrity = 'ok';
  } catch (e: unknown) {
    const msg: string = e instanceof Error ? (e.message ?? '') : String(e);
    if (msg.startsWith('HWID_MISMATCH')) {
      hardwareBindingIntegrity = 'hwid-mismatch';
    } else if (msg.includes('Config no encontrada')) {
      hardwareBindingIntegrity = 'config-missing';
    } else {
      hardwareBindingIntegrity = 'decrypt-error';
    }
  }

  // Health check rapido al servidor configurado (timeout 5s)
  let cloudConnectivity: { reachable: boolean; latencyMs?: number; httpStatus?: number; error?: string };
  if (config?.serverUrl) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${config.serverUrl}/api/v1/health`, {
        headers: { Connection: 'close' },
        signal: AbortSignal.timeout(5_000),
      });
      cloudConnectivity = { reachable: res.ok, latencyMs: Date.now() - t0, httpStatus: res.status };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? (e.message ?? 'network-error') : String(e);
      cloudConnectivity = { reachable: false, error: errMsg };
    }
  } else {
    cloudConnectivity = { reachable: false, error: 'not-activated' };
  }

  let lastLog: string | null = null;
  try {
    const logPath = path.join(DATA_DIR, 'agent.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      lastLog = lines[lines.length - 1] ?? null;
    }
  } catch { /* log no accesible */ }

  const hasCriticalError =
    hardwareBindingIntegrity === 'hwid-mismatch' ||
    hardwareBindingIntegrity === 'decrypt-error' ||
    (config !== null && !cloudConnectivity.reachable);

  const status = {
    version:                    VERSION,
    timestamp:                  new Date().toISOString(),
    activated:                  config !== null,
    agentId:                    config?.agentId   ?? null,
    serverUrl:                  config?.serverUrl ?? null,
    service:                    serviceStatus,
    service_status:             serviceStatus,
    cloud_connectivity:         cloudConnectivity,
    hardware_binding_integrity: hardwareBindingIntegrity,
    dataDir:                    DATA_DIR,
    proxyUrl:                   config?.proxyUrl  ?? null,
    lastLog,
  };

  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  setTimeout(() => {
    process.exit(hasCriticalError ? 1 : 0);
  }, 100);
}

export async function setProxy(): Promise<void> {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--set-proxy');
  const proxyUrl = args[idx + 1]?.trim() ?? '';

  try {
    const config = await ConfigManager.load();
    if (proxyUrl === '' || proxyUrl.toLowerCase() === 'none') {
      delete config.proxyUrl;
      console.log('Proxy eliminado.');
    } else {
      // Validacion basica de formato
      new URL(proxyUrl); // lanza si la URL es invalida
      config.proxyUrl = proxyUrl;
      console.log(`Proxy configurado: ${proxyUrl}`);
    }
    await ConfigManager.save(config);
    process.exit(0);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`Error al configurar proxy: ${errMsg}`);
    process.exit(1);
  }
}

export function isNetworkError(err: Error & { code?: string }): boolean {
  const errMsg = err.message ?? '';
  return (
    err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
    err.name === 'TimeoutError' || err.name === 'AbortError' ||
    errMsg.includes('fetch failed')
  );
}

/** Un solo intento — separado de `activate()` para poder reintentarlo con backoff sin duplicar la lógica de clasificación de error. */
export async function attemptActivation(
  serverUrl: string,
  key: string
): Promise<{ agentId: string; token: string; refresh_token: string }> {
  const res = await fetch(`${serverUrl}/api/v1/agents/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, hardwareId: getHardwareId() }),
    signal: AbortSignal.timeout(65_000)
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const err = await res.json() as { error?: string; message?: string };
      errorMsg = err.error || err.message || errorMsg;
    } catch { /* ignore parse error */ }
    // exit(2) = clave invalida/no autorizada; exit(1) = error de servidor
    const invalidKey = res.status === 400 || res.status === 401 || res.status === 403;
    throw Object.assign(new Error(errorMsg), { _stcExitCode: invalidKey ? 2 : 1 });
  }

  return res.json() as Promise<{ agentId: string; token: string; refresh_token: string }>;
}

// Activación offline: antes, sin red en el momento de instalar, `activate()`
// fallaba en el primer intento (exit(3)) y el instalador dejaba el servicio
// en SERVICE_DEMAND_START indefinidamente — nadie reintentaba. Ahora
// reintenta con backoff SÓLO ante error de red (una key inválida/revocada no
// se reintenta, fallaría igual y podría activar rate-limiting del lado
// servidor) — cubre el caso común de "el instalador corrió antes de que DHCP/
// DNS terminaran de asentarse" sin necesitar que un humano vuelva a correr
// `--activate` a mano.
const ACTIVATION_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * Corre `attemptFn` hasta que resuelva, o se agoten los reintentos. Extraída
 * de `activate()` para poder testearla sin `process.exit` real ni delays de
 * verdad (inyectando `sleepFn`/`delays` cortos en tests).
 */
export async function activateWithRetry<T>(
  attemptFn: () => Promise<T>,
  delays: number[] = ACTIVATION_RETRY_DELAYS_MS,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  onRetry?: (errMsg: string, delayMs: number) => void
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptFn();
    } catch (e: unknown) {
      const err = e as Error & { _stcExitCode?: number; code?: string };
      // Clave invalida/revocada u otro error de servidor ya identificado —
      // no tiene sentido reintentar, falla siempre igual.
      if (err._stcExitCode) throw err;

      const delay = isNetworkError(err) ? delays[attempt] : undefined;
      if (delay === undefined) throw err; // no es error de red, o se agotaron los reintentos

      onRetry?.(err.message ?? String(e), delay);
      await sleepFn(delay);
    }
  }
}

export async function activate(): Promise<void> {
  const args = process.argv.slice(2);
  const keyIdx = args.indexOf('--activate');
  const key = keyIdx >= 0 ? (args[keyIdx + 1] ?? '') : '';

  let serverUrl = '';
  const urlIdx = args.indexOf('--url');
  const serverIdx = args.indexOf('--server');
  if (urlIdx >= 0) serverUrl = args[urlIdx + 1] ?? '';
  else if (serverIdx >= 0) serverUrl = args[serverIdx + 1] ?? '';

  if (!key || !serverUrl) {
    console.error('Error: KEY o URL vacios.');
    console.error('Uso: agente.exe --activate <KEY> --url <URL>');
    process.exit(1);
  }

  // Normalizar URL (quitar slash final)
  if (serverUrl.endsWith('/')) serverUrl = serverUrl.slice(0, -1);

  console.log(`Activando en ${serverUrl}...`);

  try {
    const data = await activateWithRetry(
      () => attemptActivation(serverUrl, key),
      ACTIVATION_RETRY_DELAYS_MS,
      undefined,
      (errMsg, delayMs) => console.error(`Error de red (${errMsg}). Reintentando en ${delayMs / 1000}s...`)
    );

    await ConfigManager.save({
      serverUrl,
      agentId:           data.agentId,
      token:             data.token,
      refreshToken:      data.refresh_token,
      ipRanges:          [],
      snmpCommunity:     'public',
      snmpVersion:       2,
    });

    console.log(`Activado. ID: ${data.agentId}`);
    console.log(`Config cifrada en: ${DATA_DIR}`);
    process.exit(0);
  } catch (e: unknown) {
    const err = e as Error & { _stcExitCode?: number; code?: string };
    const errMsg = err.message ?? String(e);
    console.error(`Error de activacion: ${errMsg}`);
    if (err._stcExitCode) process.exit(err._stcExitCode);
    // exit(3) = error de red/conectividad (reintentos agotados); exit(1) = error generico
    process.exit(isNetworkError(err) ? 3 : 1);
  }
}
