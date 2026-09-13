import { log } from './Logger';
import { ConsoleConnector } from './ConsoleConnector';
import type { SocketManager } from './SocketManager';
import { ewsRequest, proxyEwsRequest, type EwsRelayResult } from '../capture/transport/http';
import { SnmpClient, type SnmpCredential } from '../capture/transport/snmp';
import { restartPrinter } from '../snmp/printerReset';

/** Tope de tamaño de una respuesta de EWS proxyeada — un WS sin `maxPayload` explícito no debe recibir un frame arbitrariamente grande. */
const EWS_PROXY_MAX_BYTES = 2 * 1024 * 1024;
const EWS_PROXY_TIMEOUT_MS = 10_000;

/** Errores de conexión en el 80 que ameritan reintentar por TLS: nadie escuchando, o algo que no habla HTTP en claro. */
const RETRY_OVER_TLS_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPROTO', 'EPIPE']);

/** Payload de `EWS_REQUEST` — lo arma el gateway de EWS remoto de la nube a partir de la petición del navegador. */
export interface EwsRequestPayload {
  ip?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  protocol?: 'http' | 'https';
  port?: number;
}

export interface CommandResult {
  status: 'success' | 'error';
  type: string;
  result: Record<string, unknown> | { error: string };
  id?: string;
}

export type ScanTrigger = () => void;
export type RestartDiscoveryTrigger = () => void;
export type ForceUpdateFn = () => Promise<boolean>;

export class CommandHandler {
  private commandResults: CommandResult[] = [];
  private processedCommandIds = new Set<string>();
  private socket: SocketManager | null = null;
  private scanTrigger: ScanTrigger | null = null;
  private restartDiscoveryTrigger: RestartDiscoveryTrigger | null = null;
  private forceUpdateFn: ForceUpdateFn | null = null;
  private isNetworkBusy: () => boolean = () => false;
  // Fail-closed a propósito: si nadie lo configura (ej. un test que no lo
  // necesita), EWS_PROXY rechaza siempre en vez de asumir que cualquier IP
  // es válida.
  private isKnownDeviceIp: (ip: string) => boolean = () => false;
  // Fail-closed: sin proveedor configurado, RESTART_PRINTER no tiene con qué
  // negociar SNMP y rechaza — mismo criterio que `isKnownDeviceIp`.
  private snmpCredentialsFor: (ip: string) => { credentials: SnmpCredential[]; preferredCredentialId: string | null } =
    () => ({ credentials: [], preferredCredentialId: null });

  setSocket(socket: SocketManager | null): void {
    this.socket = socket;
  }

  setScanTrigger(fn: ScanTrigger): void {
    this.scanTrigger = fn;
  }

  /** "Restart discovery" de la consola IMIL de HP SDS: NO dispara un barrido,
   *  manda el cursor al primer rango para que la vuelta arranque de nuevo. */
  setRestartDiscoveryTrigger(fn: RestartDiscoveryTrigger): void {
    this.restartDiscoveryTrigger = fn;
  }

  setForceUpdateFn(fn: ForceUpdateFn): void {
    this.forceUpdateFn = fn;
  }

  setNetworkBusyCheck(fn: () => boolean): void {
    this.isNetworkBusy = fn;
  }

  /** Defensa en profundidad: el cloud ya resuelve la IP desde `devices` (nunca confía en una IP tipeada a mano), pero el agente re-valida contra su propio `known_devices` local antes de tunelear. */
  setKnownDeviceCheck(fn: (ip: string) => boolean): void {
    this.isKnownDeviceIp = fn;
  }

  /** Fuente de credenciales SNMP para RESTART_PRINTER — la MISMA pool que ya
   *  usa el escaneo de lectura (`ScanService.credentialsForRange`), nunca
   *  una "credencial de escritura" separada: si el device permite SET con
   *  esa community/usuario, funciona; si no, `setInt` lo reporta explícito. */
  setSnmpCredentialsProvider(fn: (ip: string) => { credentials: SnmpCredential[]; preferredCredentialId: string | null }): void {
    this.snmpCredentialsFor = fn;
  }

  isProcessed(id: string): boolean {
    return this.processedCommandIds.has(id);
  }

  markProcessed(id: string): void {
    this.processedCommandIds.add(id);
    if (this.processedCommandIds.size > 1000) {
      const firstKey = this.processedCommandIds.values().next().value;
      if (firstKey) this.processedCommandIds.delete(firstKey);
    }
  }

  getResults(): CommandResult[] {
    return this.commandResults;
  }

  clearResults(): void {
    this.commandResults = [];
  }

  async handleCommand(type: string, payload: unknown = {}, id?: string): Promise<CommandResult> {
    log('INFO', `Ejecutando comando remoto: ${type} (ID: ${id || 'N/A'})`);
    try {
      let result = {};
      switch (type) {
        case 'RESCAN':
        case 'FORCE_SCAN':
          if (!this.isNetworkBusy()) {
            this.scanTrigger?.();
            // Desde el barrido continuo esto dispara UN chunk (≤400 IPs, ~40s),
            // no el espacio declarado entero: decir "scan iniciado" le hacía
            // creer al operador que el barrido completo ya terminó.
            result = { message: 'Chunk de barrido iniciado: la vuelta sigue en los chunks siguientes' };
          } else {
            log('INFO', `Comando ${type} ignorado: tarea de red en progreso.`);
            result = { message: 'Scan pospuesto: hay una tarea de red en curso' };
          }
          break;
        case 'RESTART_DISCOVERY':
          // Sin chequeo de `isNetworkBusy`: no toca la red, y `restartDiscovery()`
          // ya difiere el reset si justo hay un chunk en vuelo.
          if (!this.restartDiscoveryTrigger) {
            // Fail-closed, mismo criterio que EWS_PROXY/RESTART_PRINTER: sin
            // trigger cableado el comando no hace NADA, y un 'success' le haría
            // creer al operador que el cursor volvió al primer rango.
            throw new Error('Este agente no tiene cableado el reinicio de barrido');
          }
          this.restartDiscoveryTrigger();
          // "próxima vuelta" y no "ya": con un chunk en vuelo el reset se
          // aplica recién cuando ese chunk termina (ver `restartDiscovery`).
          result = { message: 'Barrido reiniciado: la próxima vuelta arranca desde el primer rango' };
          break;
        case 'RESTART':
          log('WARN', 'Reinicio remoto solicitado. Saliendo en 2 segundos...');
          setTimeout(() => process.exit(0), 2000);
          result = { message: 'Reiniciando agente...' };
          break;
        case 'STC_CONSOLE': {
          const connector = new ConsoleConnector();
          const commandText = typeof payload === 'object' && payload !== null && 'command' in payload
            ? String((payload as { command?: unknown }).command ?? '')
            : '';
          const output = await connector.execute(commandText);
          result = { output };
          break;
        }
        case 'FORCE_UPDATE': {
          const applied = this.forceUpdateFn ? await this.forceUpdateFn() : false;
          result = { message: applied ? 'Actualizacion aplicada. Reiniciando...' : 'Sin actualizacion disponible o verificacion fallida.' };
          break;
        }
        case 'EWS_PROXY': {
          const p = payload as { ip?: string; path?: string; method?: string };
          if (p.method && p.method !== 'GET') {
            throw new Error('EWS_PROXY sólo soporta GET');
          }
          if (!p.ip || !this.isKnownDeviceIp(p.ip)) {
            // El cloud ya resuelve la IP desde `devices`, pero si este agente
            // no la conoce localmente (equipo dado de baja acá, o
            // desincronizado), no se hace el request — nunca confiar
            // ciegamente en una IP que llega por WS.
            throw new Error(`IP ${p.ip ?? '(vacía)'} no está en known_devices de este agente`);
          }
          if (!p.path || !p.path.startsWith('/')) {
            throw new Error('path inválido');
          }
          const proxied = await proxyEwsRequest(p.ip, p.path, EWS_PROXY_MAX_BYTES, EWS_PROXY_TIMEOUT_MS);
          if (!proxied) {
            throw new Error('No se pudo contactar la EWS del dispositivo (timeout o conexión rechazada)');
          }
          result = { status: proxied.status, headers: proxied.headers, bodyBase64: proxied.bodyBase64, truncated: proxied.truncated };
          break;
        }
        case 'EWS_REQUEST': {
          result = await this.relayEwsRequest(payload as EwsRequestPayload);
          break;
        }
        case 'RESTART_PRINTER': {
          const p = payload as { ip?: string };
          if (!p.ip || !this.isKnownDeviceIp(p.ip)) {
            // Mismo criterio que EWS_PROXY: nunca confiar ciegamente en una
            // IP que llega por WS, aunque el cloud ya la resolvió desde `devices`.
            throw new Error(`IP ${p.ip ?? '(vacía)'} no está en known_devices de este agente`);
          }
          const { credentials, preferredCredentialId } = this.snmpCredentialsFor(p.ip);
          if (credentials.length === 0) {
            throw new Error('Sin credenciales SNMP configuradas para este equipo');
          }
          const snmp = new SnmpClient(p.ip, credentials, preferredCredentialId);
          const outcome = await restartPrinter(snmp);
          snmp.close();
          if (!outcome.ok) {
            const reasonText = outcome.reason === 'no-write-permission'
              ? 'la credencial SNMP configurada no tiene permiso de escritura en este equipo'
              : outcome.reason === 'no-response'
                ? 'el equipo no respondió al pedido de reinicio'
                : `el equipo rechazó el reinicio (${outcome.detail ?? 'error de protocolo'})`;
            throw new Error(reasonText);
          }
          result = { message: 'Reinicio enviado al equipo' };
          break;
        }
        default:
          throw new Error(`Comando no soportado: ${type}`);
      }

      const finalResult: CommandResult = { status: 'success', type, result, id };

      // Notificar via WS para feedback instantaneo si es posible
      if (this.socket && this.socket.isConnected()) {
        this.socket.send('command_result', finalResult);
      }

      return finalResult;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', `Error ejecutando comando ${type}: ${errMsg}`);
      const finalError: CommandResult = { status: 'error', type, result: { error: errMsg }, id };

      if (this.socket && this.socket.isConnected()) {
        this.socket.send('command_result', finalError);
      }

      return finalError;
    }
  }

  /**
   * Relay de una petición del gateway de EWS remoto del portal. A diferencia
   * de `EWS_PROXY` (una sola página, GET), acá el operador está navegando el
   * EWS de verdad: se relayan método, headers y body, que es lo que permite
   * loguearse en el equipo y mandar un formulario.
   *
   * Lo que NO se relaja es la allowlist local: la IP tiene que estar en el
   * `known_devices` de ESTE agente (fail-closed si no hay catálogo), igual que
   * antes. Es la segunda capa: la nube ya resolvió la IP desde `devices`, pero
   * el agente nunca confía ciegamente en una IP que llega por el socket.
   */
  private async relayEwsRequest(p: EwsRequestPayload): Promise<Record<string, unknown>> {
    if (!p.ip || !this.isKnownDeviceIp(p.ip)) {
      throw new Error(`IP ${p.ip ?? '(vacía)'} no está en known_devices de este agente`);
    }
    if (!p.path || !p.path.startsWith('/')) throw new Error('path inválido');
    const relayed = await this.tryEwsProtocols(p);
    if (!relayed.result.ok) throw new Error(relayed.result.error);
    const r = relayed.result.response;
    // `protocol` vuelve al gateway para que fije el acierto en la sesión y no
    // vuelva a sondear en cada imagen de la página.
    return { status: r.status, headers: r.headers, setCookie: r.setCookie ?? [], bodyBase64: r.bodyBase64, truncated: r.truncated, protocol: relayed.protocol };
  }

  /**
   * Sondeo HTTP→HTTPS: el firmware nuevo (FutureSmart, Lexmark reciente)
   * suele venir con el 80 cerrado. Se resuelve acá, no en la nube, porque el
   * único que puede probar es el que está adentro de la LAN — y así una sola
   * ida y vuelta por el WSS alcanza. Si el gateway ya sabe el protocolo (lo
   * fijó en la primera respuesta), no se sondea nada.
   */
  private async tryEwsProtocols(p: EwsRequestPayload): Promise<{ result: EwsRelayResult; protocol: 'http' | 'https' }> {
    const opts = { method: p.method, headers: p.headers, bodyBase64: p.bodyBase64, port: p.port };
    const first = p.protocol ?? 'http';
    const result = await ewsRequest(p.ip!, p.path!, EWS_PROXY_MAX_BYTES, { ...opts, protocol: first }, EWS_PROXY_TIMEOUT_MS);
    if (result.ok || p.protocol || p.port || !RETRY_OVER_TLS_CODES.has(result.code)) return { result, protocol: first };
    const overTls = await ewsRequest(p.ip!, p.path!, EWS_PROXY_MAX_BYTES, { ...opts, protocol: 'https' }, EWS_PROXY_TIMEOUT_MS);
    return overTls.ok ? { result: overTls, protocol: 'https' } : { result, protocol: first };
  }
}
