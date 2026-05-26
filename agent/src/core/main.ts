import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createHash, verify as cryptoVerify, createPublicKey } from 'crypto';
import { UPDATE_PUBLIC_KEY_HEX } from './updateKey';
import { ConfigManager, DATA_DIR, getHardwareId, type AgentConfig, type ScanSchedule } from './config';
import { openQueue, enqueueReading, pendingCount, purgeOld, upsertKnownDevice, isRegistered, getDeviceCount, closeQueue, getKnownPollMethod } from '../sync/database';
import { uploadPending, tryRefresh } from '../sync/uploader';
import { readDevice, type DeviceReading } from '../snmp/scanner';
import { LogTailer } from './LogTailer';
import { SocketManager } from './SocketManager';
import { ConsoleConnector } from './ConsoleConnector';
import { ConsoleEngine } from './ConsoleEngine';

const VERSION = '1.0.0';
let socket: SocketManager | null = null;
const LOG_MAX_BYTES = 10 * 1024 * 1024;

// --- Logger ---

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
  } catch { /* log no critico */ }
}

// Captura de errores fatales antes de que el proceso muera
process.on('uncaughtException', (err) => {
  log('ERROR', `EXCEPCION NO CAPTURADA: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', `RECHAZO DE PROMESA NO CAPTURADO: ${reason}`);
});

// --- Generador de IPs ---

function* ipRange(start: string, end: string): Generator<string> {
  const toN  = (ip: string) => ip.split('.').reduce((a, p) => (a << 8) + +p, 0);
  const toIp = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');
  for (let i = toN(start); i <= toN(end); i++) yield toIp(i >>> 0);
}

// --- Variables de Estado ---

interface CommandResult {
  status: 'success' | 'error';
  type: string;
  result: Record<string, unknown> | { error: string };
  id?: string;
}

let currentConfig: AgentConfig;
let scanInterval: NodeJS.Timeout | null = null;
let lastScanErrors = 0;
let isScanning = false;
let isSyncing = false;
let commandResults: CommandResult[] = [];
let processedCommandIds = new Set<string>();
let lastScanTime = 0;
let lastExecutedMinuteStr = '';

async function schedulerTick(): Promise<void> {
  if (isScanning) return;

  const now = new Date();
  
  // Normalize date options to Argentina (America/Argentina/Buenos_Aires)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  let timeStr = '';
  try {
    const timeFormatter = new Intl.DateTimeFormat('es-AR', options);
    timeStr = timeFormatter.format(now); // "HH:MM"
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  // Get weekday (1=Lunes, 7=Domingo)
  let dayOfWeek = now.getDay();
  if (dayOfWeek === 0) dayOfWeek = 7;
  
  try {
    const dayFormatter = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'short'
    });
    const rawWeekday = dayFormatter.format(now).toLowerCase();
    const weekdayName = rawWeekday.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const weekdayMap: Record<string, number> = {
      'lun': 1, 'mar': 2, 'mie': 3, 'jue': 4, 'vie': 5, 'sab': 6, 'dom': 7,
      'lu.': 1, 'ma.': 2, 'mi.': 3, 'ju.': 4, 'vi.': 5, 'sa.': 6, 'do.': 7,
    };
    for (const key of Object.keys(weekdayMap)) {
      if (weekdayName.includes(key)) {
        dayOfWeek = weekdayMap[key];
        break;
      }
    }
  } catch { /* fallback to system local dayOfWeek */ }

  const schedule: ScanSchedule = currentConfig.scanSchedule ?? {
    mode: 'interval',
    interval_minutes: currentConfig.scanIntervalMinutes ?? 15
  };

  if (schedule.mode === 'interval') {
    const intervalMinutes = schedule.interval_minutes ?? currentConfig.scanIntervalMinutes ?? 15;
    const elapsedMinutes = (Date.now() - lastScanTime) / 60_000;
    
    if (elapsedMinutes >= intervalMinutes) {
      log('INFO', `[Interval Scheduler] Han pasado ${Math.round(elapsedMinutes)} min (intervalo: ${intervalMinutes} min). Disparando escaneo.`);
      lastScanTime = Date.now();
      void snmpScan(currentConfig, false);
    }
  } else if (schedule.mode === 'custom') {
    const customDays = schedule.custom_days ?? [1, 2, 3, 4, 5];
    const customTimes = schedule.custom_times ?? ['09:00', '15:00'];
    
    const dayMatches = customDays.includes(dayOfWeek);
    const timeMatches = customTimes.includes(timeStr);
    
    if (dayMatches && timeMatches) {
      const minuteKey = `${dayOfWeek}-${timeStr}`;
      if (lastExecutedMinuteStr !== minuteKey) {
        lastExecutedMinuteStr = minuteKey;
        log('INFO', `[Custom Scheduler] Coincidencia de horario: Dia ${dayOfWeek}, Hora ${timeStr}. Disparando escaneo.`);
        lastScanTime = Date.now();
        void snmpScan(currentConfig, false);
      }
    }
  }
}

function getLocalIp(): string {
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

function getHostOS(): string {
  const type = os.type();
  const release = os.release();
  const arch = os.arch();
  if (type === 'Windows_NT') {
    return `Windows ${release} (${arch})`;
  }
  return `${type} ${release} (${arch})`;
}

//     Loop 1: Heartbeat (cada 60s)                                            

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
        commandResults,
        system_info: {
          version:   VERSION,
          host_name: os.hostname(),
          host_os:   getHostOS(),
          host_ip:   getLocalIp(),
          uptime:    Math.round(os.uptime())
        }
      }),
      signal: AbortSignal.timeout(65_000)
    });

    if (res.status === 401) {
      log('WARN', 'Token expirado en heartbeat. Intentando refresh...');
      const refreshed = await tryRefresh(currentConfig);
      if (refreshed) {
        currentConfig = refreshed;
        log('INFO', 'Token renovado exitosamente desde heartbeat.');
      } else {
        log('ERROR', 'No se pudo renovar el token. El agente podria estar desvinculado.');
      }
    } else if (res.ok) {
      const data = await res.json() as {
        config?: RemoteConfigPayload;
        commands?: Array<{ id?: string; type: string; payload?: unknown }>;
      };
      
      // Limpiar resultados enviados satisfactoriamente
      commandResults = [];

      if (data.config) {
        await handleRemoteConfig(data.config);
      }

      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          // DeduplicaciÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬ÃƒÂ¢aâ‚¬Å¾AÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€šAÂ ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Â¾Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’aâ‚¬Â¦Ãƒâ€šAÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ³n: Si ya lo procesamos (vÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬ÃƒÂ¢aâ‚¬Å¾AÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€šAÂ ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Â¾Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’aâ‚¬Â¦Ãƒâ€šAÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ­a WSS o heartbeat anterior), lo saltamos
          if (cmd.id && processedCommandIds.has(cmd.id)) continue;
          
          if (cmd.id) {
            processedCommandIds.add(cmd.id);
            // Mantener el set limpio (ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬ÃƒÂ¢aâ‚¬Å¾AÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€šAÂ ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Â¾Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’aâ‚¬Â¦Ãƒâ€šAÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂºltimos 1000 IDs)
            if (processedCommandIds.size > 1000) {
              const firstKey = processedCommandIds.values().next().value;
              if (firstKey) processedCommandIds.delete(firstKey);
            }
          }

          const result = await handleCommand(cmd.type, cmd.payload, cmd.id);
          commandResults.push(result);
        }
      }

      // handleCommands y handleRemoteConfig ya generan sus propios logs si es necesario
    } else if (res.status === 404) {
      log('ERROR', 'Agente no encontrado en el servidor. Eliminando identidad local...');
      await ConfigManager.deleteConfig();
      process.exit(0);
    } else if (res.status === 403) {
      log('WARN', `Acceso denegado (HTTP ${res.status}).`);
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log('WARN', `Heartbeat error: ${errMsg}`);
  } finally {
    // Re-programar siguiente heartbeat cada 60 segundos
    setTimeout(heartbeat, 60_000);
  }
}

async function handleCommand(type: string, payload: unknown = {}, id?: string) {
  log('INFO', `Ejecutando comando remoto: ${type} (ID: ${id || 'N/A'})`);
  try {
    let result = {};
    switch (type) {
      case 'RESCAN':
      case 'FORCE_SCAN':
        // No esperamos a que termine el scan
        snmpScan(currentConfig, false);
        result = { message: 'Scan iniciado correctamente' };
        break;
      case 'RESTART':
        log('WARN', 'Reinicio remoto solicitado. Saliendo en 2 segundos...');
        setTimeout(() => process.exit(0), 2000);
        result = { message: 'Reiniciando agente...' };
        break;
      case 'STC_CONSOLE':
        const connector = new ConsoleConnector();
        const commandText = typeof payload === 'object' && payload !== null && 'command' in payload
          ? String((payload as { command?: unknown }).command ?? '')
          : '';
        const output = await connector.execute(commandText);
        result = { output };
        break;
      case 'FORCE_UPDATE': {
        const applied = await checkForUpdate(currentConfig.serverUrl, true);
        result = { message: applied ? 'Actualizacion aplicada. Reiniciando...' : 'Sin actualizacion disponible o verificacion fallida.' };
        break;
      }
      default:
        throw new Error(`Comando no soportado: ${type}`);
    }
    
    const finalResult: CommandResult = { status: 'success', type, result, id };
    
    // Notificar va WS para feedback instantneo si es posible
    if (socket && socket.isConnected()) {
      socket.send('command_result', finalResult);
    }

    return finalResult;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log('ERROR', `Error ejecutando comando ${type}: ${errMsg}`);
    const finalError: CommandResult = { status: 'error', type, result: { error: errMsg }, id };
    
    if (socket && socket.isConnected()) {
      socket.send('command_result', finalError);
    }

    return finalError;
  }
}

interface RemoteConfigPayload {
  ip_ranges?: Array<{ start: string; end: string }>;
  snmp_community?: string;
  scan_interval_minutes?: number;
  scan_schedule?: ScanSchedule;
}

async function handleRemoteConfig(remote: RemoteConfigPayload): Promise<void> {
  let changed = false;
  let triggerImmediateScan = false;

  if (remote.ip_ranges && JSON.stringify(remote.ip_ranges) !== JSON.stringify(currentConfig.ipRanges)) {
    log('INFO', `Nuevo rango de IPs detectado: ${JSON.stringify(remote.ip_ranges)}`);
    // Dispara scan inmediato si llegaron rangos donde antes no habia ninguno
    if ((!currentConfig.ipRanges || currentConfig.ipRanges.length === 0) && remote.ip_ranges.length > 0) {
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
  }

  if (remote.scan_schedule && JSON.stringify(remote.scan_schedule) !== JSON.stringify(currentConfig.scanSchedule)) {
    log('INFO', `Nuevo cronograma de escaneo detectado: ${JSON.stringify(remote.scan_schedule)}`);
    currentConfig.scanSchedule = remote.scan_schedule;
    changed = true;
  }

  if (changed) {
    await ConfigManager.save(currentConfig);
    log('INFO', 'Configuracion actualizada y guardada localmente.');
  }

  if (triggerImmediateScan) {
    log('INFO', 'Primera configuracion de IPs recibida - iniciando scan inmediato.');
    // Usamos await para asegurar que termine antes de seguir, pero snmpScan manejara su propio bloqueo
    await snmpScan(currentConfig, false); 
    log('INFO', 'Scan inmediato completado - sincronizando con el portal.');
    await syncLoop(false);
  }
}

// --- Loop 2: Scanner SNMP ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function snmpScan(config: AgentConfig, loop = false): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    if (pendingCount() > 10_000) {
      log('WARN', 'Backpressure activo (>10k lecturas pendientes). Scan omitido.');
      return;
    }

  log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s)`);
  let errors = 0;
  const CONCURRENCY_LIMIT = 10; // Semaforo: max 10 IPs simultaneas

  for (const range of config.ipRanges) {
    const ips = [...ipRange(range.start, range.end)];
    log('INFO', `Escaneando ${ips.length} IPs: ${range.start} -> ${range.end} (Concurrencia: ${CONCURRENCY_LIMIT})`);

    const queue = [...ips];
    const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const ip = queue.shift();
        if (!ip) break;
        try {
          const hintMethod = getKnownPollMethod(ip) ?? undefined;
          const reading = await readDevice(ip, config.snmpCommunity, hintMethod);
          if (!reading) continue;

          if (!isRegistered(ip)) {
            const ok = await registerDevice(config, reading);
            if (ok) {
              upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, registered: true, pollMethod: reading.poll_method });
            } else {
              log('WARN', `[${ip}] Registro fallido (HTTP Error) - se reintentara en el proximo scan.`);
              upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, registered: false, pollMethod: reading.poll_method });
            }
          } else {
            upsertKnownDevice(ip, { pollMethod: reading.poll_method });
          }

          enqueueReading(reading);
          log('INFO', `[${ip}] ${reading.model} | Total: ${reading.total_pages ?? '-'} | Method: ${reading.poll_method}`);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          errors++;
          log('WARN', `[${ip}] Scan: ${errMsg}`);
        }
      }
    });

    await Promise.all(workers);
  }
  
  lastScanErrors = errors;
  log('INFO', `Scan completado. Pendientes en cola: ${pendingCount()} | Errores: ${errors}`);
} finally {
    isScanning = false;
    lastScanTime = Date.now();
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
      signal: AbortSignal.timeout(65_000)
    });
    return res.ok;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log('WARN', `Register device ${r.ip}: ${errMsg}`);
    return false;
  }
}

//  Loop 3: Sincronizador 

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
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log('WARN', `Sync error: ${errMsg}`);
  } finally {
    isSyncing = false;
    if (loop) {
      // Re-programar siguiente sincronizacin
      setTimeout(syncLoop, 5 * 60_000);
    }
  }
}

//  Auto-update del agente 
// El servidor expone GET /api/v1/agents/version  { version, url }.
// Si la versin remota difiere de VERSION, descarga el nuevo bundle.js,
// lo reemplaza de forma atmica y sale (NSSM reinicia con el nuevo binario).

function getBundlePath(): string | null {
  const arg = process.argv[1];
  // En dev (tsx), argv[1] apunta a main.ts  skip update en ese caso
  if (!arg || !arg.endsWith('.js')) return null;
  if (!fs.existsSync(arg)) return null;
  return arg;
}

let isUpdating = false;

const execAsync = promisify(exec);

async function applyZipUpdate(zipFilePath: string): Promise<boolean> {
  const installDir  = path.dirname(process.execPath);
  const stagingDir  = path.join(DATA_DIR, 'update_staging');
  const batPath     = path.join(DATA_DIR, 'apply-update.bat');

  try {
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    await execAsync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${stagingDir}' -Force"`,
      { windowsHide: true, timeout: 60_000 }
    );
    fs.unlinkSync(zipFilePath);

    const bat = [
      '@echo off',
      'ping -n 4 127.0.0.1 > nul',
      'sc stop STCCloudMonitor > nul 2>&1',
      'ping -n 4 127.0.0.1 > nul',
      'taskkill /im STC.Monitor.UI.exe /f > nul 2>&1',
      'taskkill /im stc-node.exe /f > nul 2>&1',
      `robocopy "${stagingDir}" "${installDir}" /E /IS /IT /IM /NFL /NDL /NJH /NJS /R:3 /W:1 > nul`,
      `rd /s /q "${stagingDir}" 2>nul`,
      'sc start STCCloudMonitor > nul 2>&1',
      'del "%~f0"',
    ].join('\r\n');

    fs.writeFileSync(batPath, bat, { encoding: 'utf8' });

    log('INFO', `Parche ZIP extraido correctamente. Lanzando actualizador independiente...`);

    // Usar WMI para escapar del Job Object de NSSM.
    // Si lanzamos el .bat con spawn, NSSM matara el proceso hijo en cuanto detenga el servicio.
    // WMI (Win32_Process) lo ejecuta via WmiPrvSE.exe, completamente aislado.
    await execAsync(
      `powershell -NoProfile -Command "Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList 'cmd.exe /c \"${batPath}\"'"`,
      { windowsHide: true, timeout: 15_000 }
    );

    setTimeout(() => process.exit(0), 500);
    return true;

  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log('WARN', `Error aplicando parche ZIP: ${errMsg}`);
    try { if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath); }                  catch {}
    try { if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true }); }  catch {}
    try { if (fs.existsSync(batPath))    fs.unlinkSync(batPath); }                       catch {}
    return false;
  }
}

async function checkFlags(): Promise<void> {
  try {
    const forceScanFlag = path.join(DATA_DIR, 'force-scan.flag');
    if (fs.existsSync(forceScanFlag)) {
      log('INFO', 'Flag detectado: Forzando escaneo inmediato...');
      fs.unlinkSync(forceScanFlag);
      snmpScan(currentConfig, false);
    }

    const forceUpdateFlag = path.join(DATA_DIR, 'force-update.flag');
    if (fs.existsSync(forceUpdateFlag)) {
      log('INFO', 'Flag detectado: Forzando verificacion de actualizacion...');
      fs.unlinkSync(forceUpdateFlag);
      await checkForUpdate(currentConfig.serverUrl, true);
    }
  } catch (e: unknown) {
    // Silencio en caso de error de acceso a archivos
  }
}

function isNewerVersion(remote: string, local: string): boolean {
  if (remote === local) return false;
  const rParts = remote.replace(/^v/, '').split('.').map(Number);
  const lParts = local.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function checkForUpdate(serverUrl: string, force = false): Promise<boolean> {
  if (isUpdating) return false;
  isUpdating = true;

  try {
    const bundlePath = getBundlePath();
    if (!bundlePath) {
      isUpdating = false;
      return false;
    }

    const res = await fetch(`${serverUrl}/api/v1/agents/version`, {
      headers: { Authorization: `Bearer ${currentConfig.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      isUpdating = false;
      return false;
    }

    const data = await res.json() as { version?: string; url?: string; hash?: string };
    if (!data.version || !data.url) {
       isUpdating = false;
       return false;
    }

    const ALLOWED_URL_PREFIX = 'https://github.com/ivmartinez-cd/STC-cloud/releases/download/';
    if (!data.url.startsWith(ALLOWED_URL_PREFIX)) {
      log('WARN', `URL de descarga rechazada (dominio no autorizado): ${data.url}`);
      isUpdating = false;
      return false;
    }

    const isNewer = isNewerVersion(data.version, VERSION);
    
    // Si no es mas nueva y no estamos forzando, salir.
    // Si estamos forzando pero la remota es MAS VIEJA que la actual, evitar downgrade accidental.
    if (!isNewer && !force) {
      isUpdating = false;
      return false;
    }

    if (force && !isNewer) {
      if (data.version === VERSION) {
        log('INFO', `Ya cuentas con la version mas reciente (v${VERSION}). No es necesario actualizar.`);
      } else {
        log('WARN', `Update forzado omitido: La version del servidor (v${data.version}) es anterior a la instalada (v${VERSION})`);
      }
      isUpdating = false;
      return false;
    }

    log('INFO', `Nueva version disponible: v${data.version} (actual: v${VERSION}). Descargando...`);

    const dlRes = await fetch(data.url, { signal: AbortSignal.timeout(120_000) });
    if (!dlRes.ok) {
      log('WARN', `Descarga de actualizacion fallo: HTTP ${dlRes.status}`);
      isUpdating = false;
      return false;
    }

    const buffer = Buffer.from(await dlRes.arrayBuffer());
    const isZip = data.url.toLowerCase().endsWith('.zip');
    const tempPath = isZip ? path.join(path.dirname(bundlePath), 'update.zip') : bundlePath + '.update';

    if (buffer.length < 50_000) {
       log('WARN', 'El bundle descargado es muy pequeno, descartando actualizacion.');
       isUpdating = false;
       return false;
    }

    if (data.hash) {
      const actualHash = createHash('sha256').update(buffer).digest('hex').toLowerCase();
      if (actualHash !== data.hash.toLowerCase()) {
        log('WARN', `Hash SHA256 invalido. Esperado: ${data.hash}, Obtenido: ${actualHash}. Descartando actualizacion.`);
        isUpdating = false;
        return false;
      }
      log('INFO', 'Integridad SHA256 verificada correctamente.');
    } else {
      log('WARN', 'Servidor no proporciono hash SHA256. Actualizacion instalada sin verificacion de integridad.');
    }

    if ((UPDATE_PUBLIC_KEY_HEX as string) === 'PLACEHOLDER_RUN_GEN_KEYS_FIRST') {
      log('WARN', 'SEGURIDAD: firma Ed25519 no configurada ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬ÃƒÂ¢aâ‚¬Å¾AÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ¦ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’aâ‚¬Â¦Ãƒâ€šAÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ ejecutar installer/gen-keys.js y rebuild.');
    } else {
      try {
        const sigRes = await fetch(data.url + '.sig', { signal: AbortSignal.timeout(15_000) });
        if (!sigRes.ok) {
          log('WARN', `Firma Ed25519 no disponible (HTTP ${sigRes.status}). Actualizacion rechazada.`);
          isUpdating = false;
          return false;
        }
        const sigBuf = Buffer.from(await sigRes.arrayBuffer());
        const pubKey = createPublicKey({ key: Buffer.from(UPDATE_PUBLIC_KEY_HEX, 'hex'), format: 'der', type: 'spki' });
        if (!cryptoVerify(null, buffer, pubKey, sigBuf)) {
          log('ERROR', `VIOLACION DE INTEGRIDAD [Ed25519]: La firma del paquete de actualizacion NO es valida. URL: ${data.url} | Version: ${data.version} | Timestamp: ${new Date().toISOString()}. Actualizacion rechazada ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬ÃƒÂ¢aâ‚¬Å¾AÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬AÂ¦ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Â ÃƒÂ¢aâ€šÂ¬aâ€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šAÂ¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ€šÂ¬Ã…Ãƒâ€šAÂ¬ÃƒÆ’aâ‚¬Â¦Ãƒâ€šAÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ¬ÃƒÆ’Ã†â€™Ãƒâ€ aâ‚¬â„¢ÃƒÆ’AÂ¢ÃƒÂ¢aâ‚¬Å¡AÂ¬Ãƒâ€¦AÃƒÆ’Ã†â€™ÃƒÂ¢aâ€šÂ¬Ã…ÃƒÆ’aâ‚¬Å¡Ãƒâ€šAÂ posible ataque de cadena de suministro o paquete comprometido.`);
          isUpdating = false;
          return false;
        }
        log('INFO', 'Firma Ed25519 verificada correctamente.');
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log('ERROR', `VIOLACION DE INTEGRIDAD [Ed25519]: Error al verificar firma del paquete. URL: ${data.url} | Version: ${data.version} | Error: ${errMsg}. Actualizacion rechazada.`);
        isUpdating = false;
        return false;
      }
    }

    fs.writeFileSync(tempPath, buffer);

    if (isZip) {
      log('INFO', 'Paquete completo detectado. Iniciando extraccion y parcheo atomico...');
      await applyZipUpdate(tempPath);
      return true;
    }

    try {
      fs.renameSync(tempPath, bundlePath);
      log('INFO', `Actualizacion aplicada (v${data.version}). Reiniciando para aplicar cambios...`);
      process.exit(0); 
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Error al mover bundle: ${errMsg}`);
      isUpdating = false;
      return false;
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log('ERROR', `Error en checkForUpdate: ${errMsg}`);
    isUpdating = false;
    return false;
  }
}

// con heartbeats fallidos en el momento en que el proxy/firewall bloquea 443.

async function waitForConnectivity(serverUrl: string): Promise<void> {
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

//  Estado del agente (--status) 

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

//  Proxy 

async function setProxy(): Promise<void> {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--set-proxy');
  const proxyUrl = args[idx + 1]?.trim() ?? '';

  try {
    const config = await ConfigManager.load();
    if (proxyUrl === '' || proxyUrl.toLowerCase() === 'none') {
      delete config.proxyUrl;
      console.log('Proxy eliminado.');
    } else {
      // Validacin bsica de formato
      new URL(proxyUrl); // lanza si la URL es invlida
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

//  Activacin 

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
    console.error('Error: KEY o URL vacos.');
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

    const data = await res.json() as { agentId: string; token: string; refresh_token: string };

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
  } catch (e: unknown) {
    const err = e as Error & { _stcExitCode?: number; code?: string };
    const errMsg = err.message ?? String(e);
    console.error(`Error de activacion: ${errMsg}`);
    // Propagamos exit code especifico si viene del bloque de respuesta HTTP
    if (err._stcExitCode) {
      process.exit(err._stcExitCode);
    }
    // exit(3) = error de red/conectividad; exit(1) = error generico
    const networkError =
      err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ||
      err.name === 'TimeoutError' || err.name === 'AbortError' ||
      errMsg.includes('fetch failed');
    process.exit(networkError ? 3 : 1);
  }
}

//  Main 

async function main(): Promise<void> {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (process.argv.includes('--status')) {
      await printStatus();
      return;
    }

    if (process.argv.includes('--set-proxy')) {
      await setProxy();
      return;
    }

    // Soporta tanto --server (original) como --url (generado por el portal)
    if (process.argv.includes('--activate') || process.argv.includes('--url')) {
      await activate();
      return;
    }

    //  Inicio del Agente 
    log('INFO', `STC Cloud Agent v${VERSION} iniciando...`);

    log('INFO', 'Abriendo base de datos local...');
    openQueue();

    log('INFO', 'Cargando configuracion...');
    try {
      currentConfig = await ConfigManager.load();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Error critico al cargar configuracion: ${errMsg}`);
      process.exit(1);
    }

    log('INFO', `ID: ${currentConfig.agentId} | Servidor: ${currentConfig.serverUrl}`);

    //  Proxy HTTP corporativo (opcional) 
    // undici est integrado en Node 18+  no requiere paquete adicional.
    if (currentConfig.proxyUrl) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const undici = require('undici') as unknown as {
          ProxyAgent: new (url: string) => unknown;
          setGlobalDispatcher: (dispatcher: unknown) => void;
        };
        undici.setGlobalDispatcher(new undici.ProxyAgent(currentConfig.proxyUrl));
        log('INFO', `Proxy HTTP configurado: ${currentConfig.proxyUrl}`);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        log('WARN', `No se pudo configurar el proxy: ${errMsg}`);
      }
    }

    //  Verificacin de conectividad al arrancar (HP SDS behavior) 
    await waitForConnectivity(currentConfig.serverUrl);

    //  Auto-update: verificar al arrancar y cada 4 horas 
    const isUpdatingNow = await checkForUpdate(currentConfig.serverUrl);
    if (isUpdatingNow) {
      log('INFO', 'El agente se esta actualizando. Pausando inicio de loops...');
      return;
    }
    setInterval(() => checkForUpdate(currentConfig.serverUrl), 4 * 60 * 60_000);

    //  Conexin WebSocket (Estilo HP SDS) 
    socket = new SocketManager(
      currentConfig.serverUrl,
      currentConfig.token,
      async (type, payload, id) => {
        if (id && processedCommandIds.has(id)) {
          log('INFO', `Comando duplicado ignorado (WS): ${id}`);
          return;
        }
        if (id) {
          processedCommandIds.add(id);
          if (processedCommandIds.size > 1000) {
            const firstKey = processedCommandIds.values().next().value;
            if (firstKey) processedCommandIds.delete(firstKey);
          }
        }
        await handleCommand(type, payload, id);
      },
      (level, msg) => log(level as 'INFO' | 'WARN' | 'ERROR', msg),
      currentConfig.proxyUrl,
    );
    socket.connect();

    //  Motor de Consola Local (Bridge) 
    const engine = new ConsoleEngine(8000);
    engine.start();

    // 
    log('INFO', `Configuracion del Planificador: Modo=${currentConfig.scanSchedule?.mode ?? 'interval'} | Community: ${currentConfig.snmpCommunity}`);
    
    heartbeat(); // Inicia la cadena de latidos (se auto-programa cada 5 min)
    
    setInterval(checkFlags, 10_000); // Verificar flags de la UI (scan, update) cada 10s

    syncLoop(); // Inicia la cadena: se autoprograma cada 5min internamente con setTimeout

    //  Planificador Unificado y Ticker por Minuto 
    log('INFO', 'Iniciando planificador unificado de escaneo (evaluacion cada 60s)...');
    // Disparar escaneo inicial inmediatamente al arrancar
    lastScanTime = Date.now();
    void snmpScan(currentConfig, false);
    
    // Configurar tick cada 60 segundos
    setInterval(schedulerTick, 60_000);

    log('INFO', 'Todos los loops activos.');

    async function shutdown(signal: string) {
      log('INFO', `Seal ${signal} recibida. Cerrando agente de forma segura...`);
      closeQueue();
      log('INFO', 'Base de datos cerrada. Saliendo.');
      process.exit(0);
    }
    
    // Captura de seales de terminacin para cierre limpio de SQLite
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGHUP',  () => shutdown('SIGHUP'));
    process.on('SIGBREAK', () => shutdown('SIGBREAK')); // Windows Ctrl+Break
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? (err.stack ?? '') : '';
    log('ERROR', `ERROR FATAL EN MAIN: ${errMsg}\n${errStack}`);
    try { closeQueue(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
