import os from 'os';
import { log, logTailer } from './Logger';
import { getLocalIp, getHostOS } from './NetworkUtils';
import { CHANNEL } from './channel';
import { tryRefresh } from '../sync/uploader';
import { getDeviceCount, pendingCount } from '../sync/database';
import type { AgentConfig, IpRange, IpHost, DevicePolicy } from './config';
import { ConfigManager, getHostname } from './config';
import type { CommandHandler, CommandResult } from './CommandHandler';
import { VERSION } from './version';
import type { SnmpCredential } from '../capture/transport/snmp';
import type { BusinessHoursConfig } from './BusinessHours';
import { setConfiguredTimezone } from './TimeZoneUtils';

export interface RemoteConfigPayload {
  ip_ranges?: IpRange[];
  /** Hosts puntuales a resolver por DNS (point lookup, §2.1/§2.3 gap
   *  analysis) — campo NUEVO y ADITIVO, agentes viejos que nunca lo vieron
   *  simplemente no lo entienden y lo ignoran. Mismo guard `!== undefined`
   *  que el resto de los campos nuevos. */
  ip_hosts?: IpHost[];
  snmp_community?: string;
  /** Lista completa de credenciales SNMP — AUSENTE significa "sin novedad,
   *  conservá lo que tengas" (nunca se chequea con truthy: una lista vacía
   *  `[]` es una novedad real — "volver al legacy" — y `snmp_community`
   *  vacío también lo sería si alguna vez se mandara así). */
  snmp_credentials?: SnmpCredential[];
  /** Horario laboral + TZ — mismo patrón que `snmp_credentials`: AUSENTE =
   *  "sin novedad", `null` explícito = "reset al default hardcodeado" (el
   *  cloud nunca manda `null` crudo, ver `agentService.getConfig()` — pero
   *  el tipo lo admite por si un futuro cambio lo necesita). */
  business_hours?: BusinessHoursConfig | null;
  /** Fase 10 del gap analysis vs HP SDS — mismo patrón que los campos de
   *  arriba: AUSENTE = "sin novedad", lista (incluso vacía) = reemplazo
   *  completo. */
  device_policies?: DevicePolicy[];
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
            host_name: getHostname(),
            host_os:   getHostOS(),
            host_ip:   getLocalIp(),
            uptime:    Math.round(os.uptime()),
            channel:   CHANNEL,
            runtime:   process.version,
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

    // `!== undefined` (no truthy): una lista vacía es una novedad real
    // ("ya no hay hosts puntuales"), mismo criterio que `snmp_credentials`.
    if (remote.ip_hosts !== undefined && JSON.stringify(remote.ip_hosts) !== JSON.stringify(config.ipHosts)) {
      log('INFO', `Lista de hosts puntuales actualizada: ${config.ipHosts?.length ?? 0} -> ${remote.ip_hosts.length}.`);
      config.ipHosts = remote.ip_hosts;
      changed = true;
    }

    if (remote.snmp_community && remote.snmp_community !== config.snmpCommunity) {
      // Nunca loguear el valor: `agent_logs` viaja al cloud en cada heartbeat
      // (ver arriba) — la community de la LAN del cliente no debe quedar en
      // claro ahí.
      log('INFO', 'Nueva comunidad SNMP recibida (legacy v1/v2c).');
      config.snmpCommunity = remote.snmp_community;
      changed = true;
    }

    if (remote.snmp_credentials !== undefined) {
      const prevCount = config.snmpCredentials?.length ?? 0;
      if (JSON.stringify(remote.snmp_credentials) !== JSON.stringify(config.snmpCredentials)) {
        // Igual que arriba: nunca loguear community/auth_key/priv_key, sólo
        // metadata no sensible (RFC 3414: username y protocolos no son
        // secretos, pero se omiten igual acá para no acoplar el log al
        // formato del payload).
        log('INFO', `Lista de credenciales SNMP actualizada: ${prevCount} -> ${remote.snmp_credentials.length}.`);
        config.snmpCredentials = remote.snmp_credentials;
        changed = true;
      }
    }

    if (remote.device_policies !== undefined) {
      if (JSON.stringify(remote.device_policies) !== JSON.stringify(config.devicePolicies)) {
        log('INFO', `Políticas de monitoreo por equipo actualizadas: ${config.devicePolicies?.length ?? 0} -> ${remote.device_policies.length}.`);
        config.devicePolicies = remote.device_policies;
        changed = true;
      }
    }

    if (remote.business_hours !== undefined) {
      if (JSON.stringify(remote.business_hours) !== JSON.stringify(config.businessHours)) {
        log('INFO', `Horario laboral actualizado: ${JSON.stringify(remote.business_hours)}.`);
        config.businessHours = remote.business_hours;
        changed = true;
      }
      // Se aplica siempre (no sólo si `changed`) para que Logger/LogTailer
      // usen la TZ nueva desde el próximo log, sin esperar un restart.
      setConfiguredTimezone(remote.business_hours?.timezone ?? null);
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
