import os from 'os';
import fs from 'fs';
import path from 'path';
import { ConfigManager, DATA_DIR, type AgentConfig } from './config';
import { openQueue, enqueueReading, pendingCount, purgeOld, upsertKnownDevice, isRegistered } from '../sync/database';
import { uploadPending } from '../sync/uploader';
import { readDevice, type DeviceReading } from '../snmp/scanner';

const VERSION = '1.0.0';
const LOG_MAX_BYTES = 10 * 1024 * 1024;

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_PATH = path.join(DATA_DIR, 'agent.log');

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const now = new Date();
  const timestamp = now.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const line = `[${timestamp}] [${level}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, LOG_PATH + '.1');
    }
  } catch { /* log no crítico */ }
}

// Captura de errores fatales antes de que el proceso muera
process.on('uncaughtException', (err) => {
  log('ERROR', `EXCEPCION NO CAPTURADA: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', `RECHAZO DE PROMESA NO CAPTURADO: ${reason}`);
});

// ─── Generador de IPs ─────────────────────────────────────────────────────────

function* ipRange(start: string, end: string): Generator<string> {
  const toN  = (ip: string) => ip.split('.').reduce((a, p) => (a << 8) + +p, 0);
  const toIp = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  for (let i = toN(start); i <= toN(end); i++) yield toIp(i >>> 0);
}

// ─── Variables de Estado ──────────────────────────────────────────────────────

let currentConfig: AgentConfig;
let scanInterval: NodeJS.Timeout | null = null;

// ─── Loop 1: Heartbeat (cada 60s) ────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  try {
    const res = await fetch(`${currentConfig.serverUrl}/api/v1/agents/${currentConfig.agentId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentConfig.token}` },
      body: JSON.stringify({
        version:     VERSION,
        deviceCount: 0,
        snmpErrors:  0,
        memoryMb:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      }),
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.config) {
        await handleRemoteConfig(data.config);
      }
      log('INFO', 'Heartbeat OK');
      
      // Si el escaneo estaba suspendido por un error 403 previo, lo reanudamos
      if (!scanInterval && currentConfig.ipRanges.length > 0) {
        log('INFO', 'Acceso restaurado — reanudando ciclo de escaneo.');
        const scanMs = (currentConfig.scanIntervalMinutes ?? 15) * 60_000;
        scanInterval = setInterval(() => snmpScan(currentConfig), scanMs);
      }
    } else if (res.status === 404) {
      log('ERROR', 'Agente no encontrado en el servidor (posiblemente eliminado). Eliminando identidad local...');
      await ConfigManager.deleteConfig();
      log('INFO', 'Identidad eliminada. El agente se detendr.');
      process.exit(0);
    } else if (res.status === 401 || res.status === 403) {
      log('WARN', `Acceso denegado (HTTP ${res.status}). Suspendiendo escaneos por seguridad.`);
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
    } else {
      log('WARN', `Heartbeat HTTP ${res.status}`);
    }
  } catch (e: any) {
    log('WARN', `Heartbeat error: ${e.message}`);
  }
}

async function handleRemoteConfig(remote: any): Promise<void> {
  let changed = false;
  let triggerImmediateScan = false;

  if (remote.ip_ranges && JSON.stringify(remote.ip_ranges) !== JSON.stringify(currentConfig.ipRanges)) {
    log('INFO', `Nuevo rango de IPs detectado: ${JSON.stringify(remote.ip_ranges)}`);
    // Dispara scan inmediato si llegaron rangos donde antes no había ninguno
    if (currentConfig.ipRanges.length === 0 && remote.ip_ranges.length > 0) {
      triggerImmediateScan = true;
    }
    currentConfig.ipRanges = remote.ip_ranges;
    changed = true;
  }

  if (remote.snmp_community && remote.snmp_community !== currentConfig.snmpCommunity) {
    log('INFO', `Nueva comunidad SNMP: ${remote.snmp_community}`);
    currentConfig.snmpCommunity = remote.snmp_community;
    changed = true;
  }

  if (remote.scan_interval_minutes && remote.scan_interval_minutes !== currentConfig.scanIntervalMinutes) {
    log('INFO', `Nuevo intervalo de scan: ${remote.scan_interval_minutes} min`);
    currentConfig.scanIntervalMinutes = remote.scan_interval_minutes;
    changed = true;

    if (scanInterval) clearInterval(scanInterval);
    const scanMs = currentConfig.scanIntervalMinutes * 60_000;
    scanInterval = setInterval(() => snmpScan(currentConfig), scanMs);
  }

  if (changed) {
    await ConfigManager.save(currentConfig);
    log('INFO', 'Configuración actualizada y guardada localmente.');
  }

  if (triggerImmediateScan) {
    log('INFO', 'Primera configuración de IPs recibida — iniciando scan inmediato.');
    await snmpScan(currentConfig);
    log('INFO', 'Scan inmediato completado — sincronizando con el portal.');
    await syncLoop();
  }
}

// ─── Loop 2: Scanner SNMP ─────────────────────────────────────────────────────

async function snmpScan(config: AgentConfig): Promise<void> {
  if (pendingCount() > 10_000) {
    log('WARN', 'Backpressure activo (>10k lecturas pendientes). Scan omitido.');
    return;
  }

  log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s)`);

  for (const range of config.ipRanges) {
    const ips = [...ipRange(range.start, range.end)];
    log('INFO', `Escaneando ${ips.length} IPs: ${range.start} → ${range.end}`);

    await Promise.all(ips.map(async (ip) => {
      try {
        const reading = await readDevice(ip, config.snmpCommunity);
        if (!reading) return;

        if (!isRegistered(ip)) {
          await registerDevice(config, reading);
          upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, registered: true });
        } else {
          upsertKnownDevice(ip, {});
        }

        enqueueReading(reading);
        log('INFO', `[${ip}] ${reading.model} | Total: ${reading.totalPages ?? '-'} | Mono: ${reading.monoPages ?? '-'} | Color: ${reading.colorPages ?? '-'}`);
      } catch (e: any) {
        log('WARN', `[${ip}] SNMP: ${e.message}`);
      }
    }));
  }
  log('INFO', `Scan completado. Pendientes en cola: ${pendingCount()}`);
}

async function registerDevice(config: AgentConfig, r: DeviceReading): Promise<void> {
  try {
    await fetch(`${config.serverUrl}/api/v1/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({
        devices: [{
          ip:     r.ip,
          mac:    null,
          serial: r.serial,
          brand:  r.brand,
          model:  r.sysDescr.slice(0, 100),
          name:   r.sysName || r.ip,
        }],
      }),
    });
  } catch (e: any) {
    log('WARN', `Register device ${r.ip}: ${e.message}`);
  }
}

// ─── Loop 3: Sincronizador ────────────────────────────────────────────────────

async function syncLoop(): Promise<void> {
  purgeOld();
  const { uploaded, failed } = await uploadPending();
  if (uploaded > 0) log('INFO', `Sync: ${uploaded} lecturas subidas`);
  if (failed > 0)   log('WARN', `Sync: ${failed} lecturas retenidas offline`);
}

// ─── Estado del agente (--status) ────────────────────────────────────────────

async function printStatus(): Promise<void> {
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
  try { config = await ConfigManager.load(); } catch { /* no activado */ }

  let lastLog: string | null = null;
  try {
    const logPath = path.join(DATA_DIR, 'agent.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      lastLog = lines[lines.length - 1] ?? null;
    }
  } catch { /* log no accesible */ }

  const status = {
    version:   VERSION,
    activated: config !== null,
    agentId:   config?.agentId   ?? null,
    serverUrl: config?.serverUrl ?? null,
    service:   serviceStatus,
    dataDir:   DATA_DIR,
    lastLog,
  };

  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  process.exit(0);
}

// ─── Activación ──────────────────────────────────────────────────────────────

async function activate(): Promise<void> {
  const args = process.argv.slice(2);
  const keyIdx    = args.indexOf('--activate');
  const serverIdx = args.indexOf('--server');

  if (keyIdx === -1 || serverIdx === -1) return;

  const key       = args[keyIdx + 1]?.trim();
  let serverUrl   = args[serverIdx + 1]?.trim();

  if (!key || !serverUrl) {
    console.error('Uso: agente.exe --activate <KEY> --server <URL>');
    process.exit(1);
  }

  // Normalizar URL (quitar slash final)
  if (serverUrl.endsWith('/')) serverUrl = serverUrl.slice(0, -1);

  console.log(`Activando en ${serverUrl}...`);
  try {
    const res = await fetch(`${serverUrl}/api/v1/agents/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hardwareId: os.hostname() }),
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const err = await res.json() as any;
        errorMsg = err.error || err.message || errorMsg;
      } catch { /* ignore parse error */ }
      throw new Error(errorMsg);
    }

    const data = await res.json() as any;

    await ConfigManager.save({
      serverUrl,
      agentId:           data.agentId,
      token:             data.token,
      refreshToken:      data.refresh_token,
      ipRanges:          [],
      snmpCommunity:     'public',
      snmpVersion:       2,
      scanIntervalMinutes: 15,
    });

    console.log(`Activado. ID: ${data.agentId}`);
    console.log(`Config cifrada en: ${DATA_DIR}`);
    process.exit(0);
  } catch (e: any) {
    console.error(`Error de activacion: ${e.message}`);
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (process.argv.includes('--status')) {
      await printStatus();
      return;
    }

    if (process.argv.includes('--activate')) {
      await activate();
      return;
    }

    log('INFO', `STC Cloud Agent v${VERSION} iniciando...`);
    
    log('INFO', 'Abriendo base de datos local...');
    openQueue();

    log('INFO', 'Cargando configuración...');
    try {
      currentConfig = await ConfigManager.load();
    } catch (e: any) {
      log('ERROR', `Error crtico al cargar configuracin: ${e.message}`);
      log('ERROR', 'El agente no puede continuar sin una configuracin vlida. Por favor, realice la activacin de nuevo.');
      process.exit(1);
    }

    log('INFO', `ID: ${currentConfig.agentId} | Servidor: ${currentConfig.serverUrl}`);
    log('INFO', `Scan cada ${currentConfig.scanIntervalMinutes} min | Community: ${currentConfig.snmpCommunity}`);

    heartbeat();
    setInterval(() => heartbeat(), 60_000);

    syncLoop();
    setInterval(() => syncLoop(), 5 * 60_000);

    const scanMs = (currentConfig.scanIntervalMinutes ?? 15) * 60_000;
    snmpScan(currentConfig);
    scanInterval = setInterval(() => snmpScan(currentConfig), scanMs);

    // Watcher para "Forzar Sincronización" desde la UI de bandeja
    const FORCE_FLAG = path.join(DATA_DIR, 'force-scan.flag');
    setInterval(() => {
      if (fs.existsSync(FORCE_FLAG)) {
        try { fs.unlinkSync(FORCE_FLAG); } catch { /* ignore */ }
        log('INFO', 'Sincronizacion forzada solicitada desde la UI.');
        snmpScan(currentConfig).catch(() => {});
      }
    }, 10_000);

    log('INFO', 'Todos los loops activos.');

    process.on('SIGINT',  () => { log('INFO', 'Deteniendo agente...'); process.exit(0); });
    process.on('SIGTERM', () => { log('INFO', 'Deteniendo agente...'); process.exit(0); });
  } catch (err: any) {
    log('ERROR', `ERROR FATAL EN MAIN: ${err.message}\n${err.stack}`);
    process.exit(1);
  }
}

main();
