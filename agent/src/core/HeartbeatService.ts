import os from 'os';
import { log, logTailer } from './Logger';
import { getLocalIp, getHostOS } from './NetworkUtils';
import { tryRefresh } from '../sync/uploader';
import { getDeviceCount, pendingCount } from '../sync/database';
import type { AgentConfig } from './config';
import { ConfigManager } from './config';
import type { CommandHandler, CommandResult } from './CommandHandler';

const VERSION = '1.0.0';

export interface RemoteConfigPayload {
  ip_ranges?: Array<{ start: string; end: string }>;
  snmp_community?: string;
}

interface HeartbeatDeps {
  getConfig: () => AgentConfig;
  setConfig: (c: AgentConfig) => void;
  commandHandler: CommandHandler;
  getLastScanErrors: () => number;
  triggerScan: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

export class HeartbeatService {
  private deps: HeartbeatDeps;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  start(): void {
    this.heartbeat();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async heartbeat(): Promise<void> {
    const config = this.deps.getConfig();
    try {
      // Obtener logs nuevos
      const logs = await logTailer.getNewLogs();

      const commandResults = this.deps.commandHandler.getResults();

      const res = await fetch(`${config.serverUrl}/api/v1/agents/${config.agentId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          version:     VERSION,
          deviceCount: getDeviceCount(),
          snmpErrors:  this.deps.getLastScanErrors(),
          memoryMb:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          queueSize:   pendingCount(),
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
        const refreshed = await tryRefresh(config);
        if (refreshed) {
          this.deps.setConfig(refreshed);
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
        this.deps.commandHandler.clearResults();

        if (data.config) {
          await this.handleRemoteConfig(data.config);
        }

        if (data.commands && data.commands.length > 0) {
          for (const cmd of data.commands) {
            // Deduplicacion de comandos
            if (cmd.id) {
              if (this.deps.commandHandler.isProcessed(cmd.id)) {
                log('INFO', `Comando duplicado ignorado (heartbeat): ${cmd.id}`);
                continue;
              }
              this.deps.commandHandler.markProcessed(cmd.id);
            }
            await this.deps.commandHandler.handleCommand(cmd.type, cmd.payload, cmd.id);
          }
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('WARN', `Heartbeat error: ${errMsg}`);
    }

    // Re-programar siguiente latido
    this.timer = setTimeout(() => this.heartbeat(), 60_000);
  }

  private async handleRemoteConfig(remote: RemoteConfigPayload): Promise<void> {
    const config = this.deps.getConfig();
    let changed = false;
    let triggerImmediateScan = false;

    if (remote.ip_ranges && JSON.stringify(remote.ip_ranges) !== JSON.stringify(config.ipRanges)) {
      log('INFO', `Nuevo rango de IPs detectado: ${JSON.stringify(remote.ip_ranges)}`);
      // Dispara scan inmediato si llegaron rangos donde antes no habia ninguno
      if ((!config.ipRanges || config.ipRanges.length === 0) && remote.ip_ranges.length > 0) {
        triggerImmediateScan = true;
      }
      config.ipRanges = remote.ip_ranges;
      changed = true;
    }

    if (remote.snmp_community && remote.snmp_community !== config.snmpCommunity) {
      log('INFO', `Nueva comunidad SNMP: ${remote.snmp_community}`);
      config.snmpCommunity = remote.snmp_community;
      changed = true;
    }

    if (changed) {
      await ConfigManager.save(config);
      log('INFO', 'Configuracion actualizada y guardada localmente.');
    }

    if (triggerImmediateScan) {
      log('INFO', 'Primera configuracion de IPs recibida - iniciando scan inmediato.');
      await this.deps.triggerScan();
      log('INFO', 'Scan inmediato completado - sincronizando con el portal.');
      await this.deps.triggerSync();
    }
  }
}
