import os from 'os';
import fs from 'fs';
import path from 'path';
import { ConfigManager, DATA_DIR, getHardwareId, type AgentConfig } from './config';
import { openQueue, enqueueReading, pendingCount, purgeOld, upsertKnownDevice, isRegistered, getDeviceCount, closeQueue } from '../sync/database';
import { uploadPending, tryRefresh } from '../sync/uploader';
import { readDevice, type DeviceReading } from '../snmp/scanner';
import { LogTailer } from './LogTailer';
import { SocketManager } from './SocketManager';

const VERSION = '1.0.0';
let socket: SocketManager | null = null;
const LOG_MAX_BYTES = 10 * 1024 * 1024;

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_PATH = path.join(DATA_DIR, 'agent.log');
const logTailer = new LogTailer(LOG_PATH);

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const now = new Date();
  const date = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const timestamp = `${date} ${time}`;

  const levelPadded = level.padEnd(8);
  const line = `${timestamp}     ${levelPadded} ${msg}`;
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
let lastScanErrors = 0;
let isScanning = false;
let isSyncing = false;
let commandResults: any[] = [];

// ─── Loop 1: Heartbeat (cada 60s) ────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  try {
    // Obtener logs nuevos
    const logs = await logTailer.getNewLogs();

    const res = await fetch(`${currentConfig.serverUrl}/api/v1/agents/${currentConfig.agentId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentConfig.token}` },
      body: JSON.stringify({
        version:     VERSION,
        deviceCount: getDeviceCount(),
        snmpErrors:  lastScanErrors,
        memoryMb:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        logs,
        commandResults
      }),
    });

    if (res.status === 401) {
      log('WARN', 'Token expirado en heartbeat. Intentando refresh...');
      const refreshed = await tryRefresh(currentConfig);
      if (refreshed) {
        currentConfig = refreshed;
        log('INFO', 'Token renovado exitosamente desde heartbeat.');
      } else {
        log('ERROR', 'No se pudo renovar el token. El agente podría estar desvinculado.');
      }
    } else if (res.ok) {
      const data = await res.json() as any;
      
      // Limpiar resultados enviados satisfactoriamente
      commandResults = [];

      if (data.config) {
        await handleRemoteConfig(data.config);
      }

      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          const result = await handleCommand(cmd.type, cmd.payload);
          commandResults.push({ id: cmd.id, ...result });
        }
      }

      log('INFO', 'Heartbeat OK');
    } else if (res.status === 404) {
      log('ERROR', 'Agente no encontrado en el servidor. Eliminando identidad local...');
      await ConfigManager.deleteConfig();
      process.exit(0);
    } else if (res.status === 403) {
      log('WARN', `Acceso denegado (HTTP ${res.status}).`);
    }
  } catch (e: any) {
    log('WARN', `Heartbeat error: ${e.message}`);
  } finally {
    // Re-programar siguiente heartbeat (ahora 5 min porque tenemos WebSocket para comandos)
    setTimeout(heartbeat, 5 * 60_000);
  }
}

async function handleCommand(type: string, payload: any = {}) {
  log('INFO', `Ejecutando comando remoto: ${type}`);
  try {
    let result = {};
    switch (type) {
      case 'RESCAN':
      case 'FORCE_SCAN':
        // No esperamos a que termine el scan
        snmpScan(currentConfig, false);
        result = { message: 'Scan iniciado correctamente' };
        break;
      case 'PING':
        result = { message: 'Pong', timestamp: new Date().toISOString() };
        break;
      case 'RESTART':
        log('WARN', 'Reinicio remoto solicitado. Saliendo en 2 segundos...');
        setTimeout(() => process.exit(0), 2000);
        result = { message: 'Reiniciando agente...' };
        break;
      default:
        throw new Error(`Comando no soportado: ${type}`);
    }
    // Si viene de HTTP tendrá un cmd.id, si viene de WS no necesariamente
    return { status: 'success', result };
  } catch (e: any) {
    log('ERROR', `Error ejecutando comando ${type}: ${e.message}`);
    return { status: 'error', result: { error: e.message } };
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
    // No necesitamos resetear intervalos porque ahora usamos timeouts recursivos
  }

  if (changed) {
    await ConfigManager.save(currentConfig);
    log('INFO', 'Configuración actualizada y guardada localmente.');
  }

  if (triggerImmediateScan) {
    log('INFO', 'Primera configuración de IPs recibida — iniciando scan inmediato.');
    // Usamos await para asegurar que termine antes de seguir, pero snmpScan manejará su propio bloqueo
    await snmpScan(currentConfig, false); 
    log('INFO', 'Scan inmediato completado — sincronizando con el portal.');
    await syncLoop(false);
  }
}

// ─── Loop 2: Scanner SNMP ─────────────────────────────────────────────────────

async function snmpScan(config: AgentConfig, loop = true): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    if (pendingCount() > 10_000) {
      log('WARN', 'Backpressure activo (>10k lecturas pendientes). Scan omitido.');
      return;
    }

  log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s)`);
  let errors = 0;
  const CONCURRENCY_LIMIT = 10; // Semáforo: máx 10 IPs simultáneas

  for (const range of config.ipRanges) {
    const ips = [...ipRange(range.start, range.end)];
    log('INFO', `Escaneando ${ips.length} IPs: ${range.start} → ${range.end} (Concurrencia: ${CONCURRENCY_LIMIT})`);

    const queue = [...ips];
    const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const ip = queue.shift();
        if (!ip) break;
        try {
          const reading = await readDevice(ip, config.snmpCommunity);
          if (!reading) continue;

          if (!isRegistered(ip)) {
            const ok = await registerDevice(config, reading);
            if (ok) {
              // Solo marcamos como registrado si el backend respondió OK
              upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, registered: true });
            } else {
              log('WARN', `[${ip}] Registro fallido (HTTP Error) — se reintentará en el próximo scan.`);
              // Guardamos el dispositivo pero sin el flag 'registered'
              upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, registered: false });
            }
          } else {
            upsertKnownDevice(ip, {});
          }

          enqueueReading(reading);
          log('INFO', `[${ip}] ${reading.model} | Total: ${reading.total_pages ?? '-'}`);
        } catch (e: any) {
          errors++;
          log('WARN', `[${ip}] SNMP: ${e.message}`);
        }
      }
    });

    await Promise.all(workers);
  }
  
  lastScanErrors = errors;
  log('INFO', `Scan completado. Pendientes en cola: ${pendingCount()} | Errores: ${errors}`);
} finally {
    isScanning = false;
    if (loop) {
      const scanMs = (currentConfig.scanIntervalMinutes ?? 15) * 60_000;
      setTimeout(() => snmpScan(currentConfig), scanMs);
    }
  }
}

async function registerDevice(config: AgentConfig, r: DeviceReading): Promise<boolean> {
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({
        devices: [{
          ip:     r.ip,
          mac:    null,
          serial: r.serial,
          brand:  r.brand,
          model:  (r.model || r.brand || "Unknown").slice(0, 100),
          name:   (r.model || r.ip || "Unknown Device").slice(0, 100),
        }],
      }),
    });
    return res.ok;
  } catch (e: any) {
    log('WARN', `Register device ${r.ip}: ${e.message}`);
    return false;
  }
}

// ─── Loop 3: Sincronizador ────────────────────────────────────────────────────

async function syncLoop(loop = true): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    purgeOld();
    const { uploaded, failed, updatedConfig } = await uploadPending(currentConfig);
    if (updatedConfig) {
      log('INFO', 'Token actualizado detectado durante Sync. Actualizando memoria.');
      currentConfig = updatedConfig;
    }
    if (uploaded > 0) log('INFO', `Sync: ${uploaded} lecturas subidas`);
    if (failed > 0)   log('WARN', `Sync: ${failed} lecturas retenidas offline`);
  } catch (e: any) {
    log('WARN', `Sync error: ${e.message}`);
  } finally {
    isSyncing = false;
    if (loop) {
      // Re-programar siguiente sincronización
      setTimeout(syncLoop, 5 * 60_000);
    }
  }
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
  const serverIdx = args.indexOf('--server') !== -1 ? args.indexOf('--server') : args.indexOf('--url');

  if (keyIdx === -1 || serverIdx === -1) {
    console.error('Error: Faltan argumentos requeridos.');
    console.error('Uso: agente.exe --activate <KEY> --url <URL>');
    process.exit(1);
  }

  const key       = args[keyIdx + 1]?.trim();
  let serverUrl   = args[serverIdx + 1]?.trim();

  if (!key || !serverUrl) {
    console.error('Error: KEY o URL vacíos.');
    console.error('Uso: agente.exe --activate <KEY> --url <URL>');
    process.exit(1);
  }

  // Normalizar URL (quitar slash final)
  if (serverUrl.endsWith('/')) serverUrl = serverUrl.slice(0, -1);

  console.log(`Activando en ${serverUrl}...`);
  try {
    const res = await fetch(`${serverUrl}/api/v1/agents/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, hardwareId: getHardwareId() }),
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

    // Soporta tanto --server (original) como --url (generado por el portal)
    if (process.argv.includes('--activate') || process.argv.includes('--url')) {
      await activate();
      return;
    }

    // ─── Inicio del Agente ───────────────────────────────────────────────────
    log('INFO', `STC Cloud Agent v${VERSION} iniciando...`);
    
    log('INFO', 'Abriendo base de datos local...');
    openQueue();

    log('INFO', 'Cargando configuración...');
    try {
      currentConfig = await ConfigManager.load();
    } catch (e: any) {
      log('ERROR', `Error crítico al cargar configuración: ${e.message}`);
      process.exit(1);
    }

    log('INFO', `ID: ${currentConfig.agentId} | Servidor: ${currentConfig.serverUrl}`);

    // ─── Conexión WebSocket (Estilo HP SDS) ──────────────────────────────────
    socket = new SocketManager(
      currentConfig.serverUrl,
      currentConfig.token,
      (type, payload) => handleCommand(type, payload),
      (level, msg) => log(level as any, msg)
    );
    socket.connect();

    // ─── Iniciar Loops ───────────────────────────────────────────────────────
    log('INFO', `Scan cada ${currentConfig.scanIntervalMinutes} min | Community: ${currentConfig.snmpCommunity}`);
    
    heartbeat(); // Inicia la cadena de latidos (se auto-programa cada 5 min)

    syncLoop(); // Primer sync
    setInterval(syncLoop, 60000); // Sincronización de datos cada 60s

    snmpScan(currentConfig); // Iniciar bucle de escaneo

    log('INFO', 'Todos los loops activos.');

    async function shutdown(signal: string) {
      log('INFO', `Señal ${signal} recibida. Cerrando agente de forma segura...`);
      closeQueue();
      log('INFO', 'Base de datos cerrada. Saliendo.');
      process.exit(0);
    }
    
    // Captura de señales de terminación para cierre limpio de SQLite
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP',  () => shutdown('SIGHUP'));
    process.on('SIGBREAK', () => shutdown('SIGBREAK')); // Windows Ctrl+Break
  } catch (err: any) {
    log('ERROR', `ERROR FATAL EN MAIN: ${err.message}\n${err.stack}`);
    try { closeQueue(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
