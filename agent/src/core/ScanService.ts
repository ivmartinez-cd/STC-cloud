import { log } from './Logger';
import { materializeRange, resolveHostname, isPrivateOrReservedIp } from './NetworkUtils';
import { isBusinessHours } from './BusinessHours';
import { captureDevice, type CaptureScope, type CaptureHint } from '../capture';
import type { DeviceReading } from '../capture/reading';
import { enqueueReading, pendingCount, isBackpressureActive, upsertKnownDevice, isRegistered, getKnownDevices, getKnownDeviceInfo, shouldEnqueueReading, recordLastReadingSnapshot, type KnownDevice } from '../sync/database';
import type { AgentConfig, IpHost } from './config';
import { policyFor, type DevicePolicyState } from './devicePolicy';
import type { SnmpCredential } from '../capture/transport/snmp';

interface ScanServiceDeps {
  getConfig: () => AgentConfig;
}

/**
 * Scopes por loop (alineado a HP SDS: Identity/Discovery, Meter, Consumables+Tray,
 * Alert). `alerts` salió de `SUPPLIES_SCOPES` en la Fase 11 del gap analysis — antes
 * refrescaba cada 60/240 min mezclado con consumibles, ahora tiene loop propio 3/15
 * (`ALERT_SCOPES`/`runAlertTask`), sin duplicar el walk de `prtAlertTable` dos veces
 * por ciclo. `DISCOVERY_SCOPES` sigue trayendo todo — es el barrido completo de un
 * equipo recién visto o poco visitado.
 */
const DISCOVERY_SCOPES: readonly CaptureScope[] = ['identity', 'meters', 'supplies', 'alerts', 'trays'];
const METER_SCOPES:     readonly CaptureScope[] = ['meters'];
const SUPPLIES_SCOPES:  readonly CaptureScope[] = ['supplies', 'trays'];
const ALERT_SCOPES:     readonly CaptureScope[] = ['alerts'];
const CONCURRENCY_LIMIT = 10;
/**
 * Tope de seguridad TOTAL (a través de todos los rangos de un mismo ciclo de
 * scan) — defensa en profundidad independiente de la validación cloud
 * (`cloud/src/services/ipRangeSpec.ts`, mismo número: con
 * CONCURRENCY_LIMIT=10 y ~2000ms peor-caso por host muerto, 2000 IPs quedan
 * bajo el intervalo de discovery de 10 min en horario laboral). Protege
 * contra datos viejos pre-validación o ediciones manuales de DB — nunca
 * confía en que la config recibida ya venga acotada.
 */
const MAX_TOTAL_SCAN_SIZE = 2000;
/**
 * Dedupe de lecturas idénticas en meter/supplies (gap analysis: un equipo
 * ocioso mandaba 72 filas/día sin comparar contra la anterior). Se manda si
 * cambió algo relevante (contadores/tóner) o ya pasaron estas horas desde el
 * último envío — para no perder la señal de "sigo vivo" indefinidamente.
 * Sólo aplica acá (meter/supplies, loop frecuente); discovery no se dedupea
 * (corre cada 10-60 min, y siempre puede estar registrando un equipo nuevo).
 */
const DEDUPE_WINDOW_HOURS = 4;

function hintFrom(d: KnownDevice | null): CaptureHint | undefined {
  if (!d) return undefined;
  return { driver: d.driver, brand: d.brand, model: d.model, serial: d.serial, pollMethod: d.poll_method };
}

/** Lista de credenciales a probar + cuál probar primero (si ya se sabe cuál
 *  sirvió la última vez para esta IP — evita recorrer toda la lista en cada
 *  ciclo para equipos ya conocidos). */
function snmpArgsFor(credentials: SnmpCredential[], known: KnownDevice | null) {
  return { credentials, preferredCredentialId: known?.snmp_cred_id ?? null };
}

/**
 * Filtra el pool de credenciales del agente a las que un rango/host puntual
 * declaró vía `credential_ids` (§2.3 gap analysis: "credenciales por
 * rango") — ausente = pool completo (comportamiento de siempre). Preserva
 * el ORDEN del pool original: es un filtro/subset, no una re-priorización,
 * para no alterar la semántica de fail-fast ya establecida en
 * `SnmpClient.negotiate()`. El cloud ya resolvió ids colgantes antes de
 * mandar esto (ver `agentService.getConfig()`), así que acá `credentialIds`
 * sólo contiene ids que existen en el pool, cuando viene presente.
 */
export function credentialsForRange(pool: SnmpCredential[], credentialIds: string[] | undefined): SnmpCredential[] {
  if (!credentialIds || credentialIds.length === 0) return pool;
  const idSet = new Set(credentialIds);
  return pool.filter((c) => idSet.has(c.id));
}

/**
 * Orquesta los cuatro loops de red del agente usando el motor de captura:
 *  - scan()             : discovery sobre los rangos IP (identidad + todo), registra equipos nuevos.
 *  - runMeterTask()     : contadores de equipos conocidos (ruta rápida: driver persistido).
 *  - runSuppliesTask()  : insumos y bandejas de equipos conocidos.
 *  - runAlertTask()     : alertas de equipos conocidos — loop propio 3/15 (Fase 11).
 */
export class ScanService {
  private deps: ScanServiceDeps;
  private _isScanning = false;
  private _lastScanErrors = 0;

  constructor(deps: ScanServiceDeps) {
    this.deps = deps;
  }

  get isScanning(): boolean { return this._isScanning; }
  get lastScanErrors(): number { return this._lastScanErrors; }

  async scan(): Promise<void> {
    if (this._isScanning) return;
    this._isScanning = true;
    const config = this.deps.getConfig();

    try {
      if (isBackpressureActive()) {
        log('WARN', 'Backpressure activo (>10k lecturas pendientes). Scan omitido.');
        return;
      }

      log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s) y ${config.ipHosts?.length ?? 0} host(s) puntuales`);
      let errors = 0;
      let scanBudget = MAX_TOTAL_SCAN_SIZE;

      // Hosts puntuales (point lookup) ANTES que los rangos masivos — un
      // dispositivo pineado a propósito por hostname no debería perder
      // lugar en el presupuesto compartido frente a un rango grande.
      // Resolución + captura SECUENCIAL (acotada por MAX_SPECS≤32 del lado
      // cloud): el peor caso (todos con DNS caído) es `32 × timeout`,
      // insignificante contra un ciclo de 10-60 min, y evita saturar el
      // threadpool de libuv con lookups en paralelo (ver `resolveHostname`).
      for (const host of config.ipHosts ?? []) {
        if (scanBudget <= 0) {
          log('WARN', `Tope de seguridad de ${MAX_TOTAL_SCAN_SIZE} IPs por ciclo alcanzado — se omiten los hosts puntuales restantes.`);
          break;
        }
        const ip = await this.resolveHost(host);
        if (!ip) continue;
        scanBudget -= 1;
        const creds = credentialsForRange(config.snmpCredentials ?? [], host.credential_ids);
        if (await this.captureAndRecord(ip, config, creds)) errors++;
      }

      for (const range of config.ipRanges) {
        if (scanBudget <= 0) {
          log('WARN', `Tope de seguridad de ${MAX_TOTAL_SCAN_SIZE} IPs por ciclo alcanzado — se omiten los rangos restantes.`);
          break;
        }
        const { ips, truncated } = materializeRange(range, scanBudget);
        scanBudget -= ips.length;
        if (truncated) {
          log('WARN', `Rango ${range.start}-${range.end} truncado a ${ips.length} IPs (tope de seguridad de ${MAX_TOTAL_SCAN_SIZE} por ciclo).`);
        }
        log('INFO', `Escaneando ${ips.length} IPs: ${range.start} -> ${range.end} (Concurrencia: ${CONCURRENCY_LIMIT})`);

        const creds = credentialsForRange(config.snmpCredentials ?? [], range.credential_ids);
        const queue = [...ips];
        const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
          while (queue.length > 0) {
            const ip = queue.shift();
            if (!ip) break;
            if (await this.captureAndRecord(ip, config, creds)) errors++;
          }
        });
        await Promise.all(workers);
      }

      this._lastScanErrors = errors;
      log('INFO', `Scan completado. Pendientes en cola: ${pendingCount()} | Errores: ${errors}`);
    } finally {
      this._isScanning = false;
    }
  }

  /** Resuelve un host puntual con timeout (ver `resolveHostname` en
   *  `NetworkUtils.ts`); tolerante (NXDOMAIN/timeout → WARN, `null`, se
   *  reintenta el próximo ciclo — nunca rompe el resto del scan). Si
   *  resuelve a una IP pública, sólo lo loguea (WARN, no bloqueante) — el
   *  cloud no puede chequear esto sin resolver la DNS interna del cliente. */
  private async resolveHost(host: IpHost): Promise<string | null> {
    const ip = await resolveHostname(host.hostname);
    if (!ip) {
      log('WARN', `[${host.hostname}] No se pudo resolver (DNS caído, NXDOMAIN, o timeout) — se reintenta el próximo ciclo.`);
      return null;
    }
    if (!isPrivateOrReservedIp(ip)) {
      log('WARN', `[${host.hostname}] resolvió a una IP pública (${ip}) — revisar la configuración DNS del sitio.`);
    }
    return ip;
  }

  /** Captura+registra una IP ya resuelta (de un rango o de un host puntual)
   *  — factorizado porque ambos loops de `scan()` necesitan exactamente la
   *  misma lógica de captura/registro/encolado. Devuelve `true` si hubo un
   *  error (para que el caller lleve el conteo de `errors`), nunca lanza. */
  private async captureAndRecord(ip: string, config: AgentConfig, creds: SnmpCredential[]): Promise<boolean> {
    try {
      // Fase 10 del gap analysis vs HP SDS — un equipo `disabled`/`ignored`
      // no se vuelve a capturar en cada ciclo de discovery (el cloud lo
      // descarta igual si algo se cuela, pero esto ahorra el tráfico SNMP).
      const policy = policyFor(config, ip);
      if (policy === 'disabled' || policy === 'ignored') return false;

      const known = getKnownDeviceInfo(ip);
      const out = await captureDevice({ ip, ...snmpArgsFor(creds, known), scopes: DISCOVERY_SCOPES, hint: hintFrom(known) });
      if (!out) return false;
      const { reading, driver } = out;
      const driverId = driver.profile?.id ?? driver.family.id;

      if (!isRegistered(ip)) {
        const ok = await this.registerDevice(config, reading);
        if (!ok) log('WARN', `[${ip}] Registro fallido (HTTP Error) - se reintentara en el proximo scan.`);
        upsertKnownDevice(ip, { serial: reading.serial ?? undefined, brand: reading.brand, model: reading.model, registered: ok, pollMethod: reading.poll_method, driver: driverId, snmpCredId: out.credentialId });
      } else {
        upsertKnownDevice(ip, { serial: reading.serial ?? undefined, model: reading.model, pollMethod: reading.poll_method, driver: driverId, snmpCredId: out.credentialId });
      }

      enqueueReading(reading);
      log('INFO', `[${ip}] ${reading.model} | Total: ${reading.total_pages ?? '-'} | Method: ${reading.poll_method} | Driver: ${driverId}${driver.via === 'generic' ? ' (sin perfil)' : ''} | Id: ${out.identity.source}/${out.identity.brand}`);
      return false;
    } catch (e: unknown) {
      log('WARN', `[${ip}] Scan: ${e instanceof Error ? e.message : String(e)}`);
      return true;
    }
  }

  async runMeterTask(): Promise<void> {
    // 'supplies_only': ese equipo sólo debe reportar insumos, no contadores.
    await this.runKnownDevicesTask('MeterTask', METER_SCOPES, (r) => `total=${r.total_pages ?? '-'} mono=${r.mono_pages ?? '-'} color=${r.color_pages ?? '-'}`, ['supplies_only', 'disabled', 'ignored']);
  }

  async runSuppliesTask(): Promise<void> {
    // 'reports_only': ese equipo sólo debe reportar contadores, no insumos.
    await this.runKnownDevicesTask('SupplyTask', SUPPLIES_SCOPES, (r) => `K=${r.toner_black ?? '-'} C=${r.toner_cyan ?? '-'} M=${r.toner_magenta ?? '-'} Y=${r.toner_yellow ?? '-'}`, ['reports_only', 'disabled', 'ignored']);
  }

  /** Fase 11 del gap analysis vs HP SDS — loop dedicado de alertas (3/15 min),
   *  separado de consumibles (60/240). Mismos criterios de policy que
   *  `runSuppliesTask` (las alertas son parte de "reportar insumos/estado"
   *  a nivel negocio, un equipo `reports_only` no debe generarlas). */
  async runAlertTask(): Promise<void> {
    await this.runKnownDevicesTask('AlertTask', ALERT_SCOPES, (r) => `alerts=${r.supplies_details?.alerts?.length ?? 0}`, ['reports_only', 'disabled', 'ignored']);
  }

  private async runKnownDevicesTask(label: string, scopes: readonly CaptureScope[], summarize: (r: DeviceReading) => string, skipStates: readonly DevicePolicyState[]): Promise<void> {
    try {
      if (isBackpressureActive()) {
        log('WARN', `Backpressure activo (>10k lecturas pendientes). [${label}] omitido.`);
        return;
      }

      const config = this.deps.getConfig();
      const devices = getKnownDevices();
      if (devices.length === 0) return;
      log('INFO', `[${label}] ${isBusinessHours(config.businessHours) ? 'horario laboral' : 'fuera de horario'} — ${devices.length} dispositivo(s)`);

      const queue = [...devices];
      const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const d = queue.shift();
          if (!d) break;
          if (skipStates.includes(policyFor(config, d.ip))) continue;
          try {
            // Sin restricción por rango acá a propósito: `known_devices` no
            // tiene vínculo a qué rango descubrió cada IP, y un dispositivo
            // ya conocido casi siempre acierta con `snmp_cred_id` cacheado
            // en el primer intento (sin fail-fast) — restringir por rango
            // no aporta nada real en meter/supplies, sólo en discovery.
            const out = await captureDevice({ ip: d.ip, ...snmpArgsFor(config.snmpCredentials ?? [], d), scopes, hint: hintFrom(d), trustHint: true });
            if (!out || !out.result) continue; // apagada / sin respuesta: no encolar lecturas vacías
            const reading = out.reading;
            const hasData = reading.total_pages !== null || reading.toner_black != null || reading.toner_cyan != null
              || reading.toner_magenta != null || reading.toner_yellow != null || !!reading.supplies_details;
            if (!hasData) continue;
            if (!reading.serial && d.serial) reading.serial = d.serial;
            upsertKnownDevice(d.ip, { pollMethod: reading.poll_method, driver: out.driver.profile?.id ?? out.driver.family.id, snmpCredId: out.credentialId });
            if (shouldEnqueueReading(d.ip, reading, DEDUPE_WINDOW_HOURS)) {
              enqueueReading(reading);
              recordLastReadingSnapshot(d.ip, reading);
              log('INFO', `[${label}] [${d.ip}] ${summarize(reading)} method=${reading.poll_method}`);
            } else {
              log('INFO', `[${label}] [${d.ip}] sin cambios — no se encola (dedupe)`);
            }
          } catch { /* continue */ }
        }
      });
      await Promise.all(workers);
    } catch (e: unknown) {
      log('WARN', `[${label}] Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async registerDevice(config: AgentConfig, r: DeviceReading): Promise<boolean> {
    try {
      const res = await fetch(`${config.serverUrl}/api/v1/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          devices: [{
            ip:     r.ip,
            mac:    r.mac ?? null,
            serial: r.serial,
            brand:  r.brand,
            model:  (r.model || r.brand || 'Unknown').slice(0, 100),
            name:   (r.model || r.ip || 'Unknown Device').slice(0, 100),
          }],
        }),
        signal: AbortSignal.timeout(65_000),
      });
      return res.ok;
    } catch (e: unknown) {
      log('WARN', `Register device ${r.ip}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
