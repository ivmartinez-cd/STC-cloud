import { log } from './Logger';
import { materializeRange } from './NetworkUtils';
import { isBusinessHours } from './BusinessHours';
import { captureDevice, type CaptureScope, type CaptureHint } from '../capture';
import type { DeviceReading } from '../capture/reading';
import { enqueueReading, pendingCount, isBackpressureActive, upsertKnownDevice, isRegistered, getKnownDevices, getKnownDeviceInfo, type KnownDevice } from '../sync/database';
import type { AgentConfig } from './config';

interface ScanServiceDeps {
  getConfig: () => AgentConfig;
}

/** Scopes por loop (alineado a HP SDS: Identity/Discovery, Meter, Consumables+Alert+Tray). */
const DISCOVERY_SCOPES: readonly CaptureScope[] = ['identity', 'meters', 'supplies', 'alerts', 'trays'];
const METER_SCOPES:     readonly CaptureScope[] = ['meters'];
const SUPPLIES_SCOPES:  readonly CaptureScope[] = ['supplies', 'alerts', 'trays'];
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

function hintFrom(d: KnownDevice | null): CaptureHint | undefined {
  if (!d) return undefined;
  return { driver: d.driver, brand: d.brand, model: d.model, serial: d.serial, pollMethod: d.poll_method };
}

/** Lista de credenciales a probar + cuál probar primero (si ya se sabe cuál
 *  sirvió la última vez para esta IP — evita recorrer toda la lista en cada
 *  ciclo para equipos ya conocidos). */
function snmpArgsFor(config: AgentConfig, known: KnownDevice | null) {
  return { credentials: config.snmpCredentials ?? [], preferredCredentialId: known?.snmp_cred_id ?? null };
}

/**
 * Orquesta los tres loops de red del agente usando el motor de captura:
 *  - scan()             : discovery sobre los rangos IP (identidad + todo), registra equipos nuevos.
 *  - runMeterTask()     : contadores de equipos conocidos (ruta rápida: driver persistido).
 *  - runSuppliesTask()  : insumos, alertas y bandejas de equipos conocidos.
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

      log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s)`);
      let errors = 0;
      let scanBudget = MAX_TOTAL_SCAN_SIZE;

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

        const queue = [...ips];
        const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
          while (queue.length > 0) {
            const ip = queue.shift();
            if (!ip) break;
            try {
              const known = getKnownDeviceInfo(ip);
              const out = await captureDevice({ ip, ...snmpArgsFor(config, known), scopes: DISCOVERY_SCOPES, hint: hintFrom(known) });
              if (!out) continue;
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
            } catch (e: unknown) {
              errors++;
              log('WARN', `[${ip}] Scan: ${e instanceof Error ? e.message : String(e)}`);
            }
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

  async runMeterTask(): Promise<void> {
    await this.runKnownDevicesTask('MeterTask', METER_SCOPES, (r) => `total=${r.total_pages ?? '-'} mono=${r.mono_pages ?? '-'} color=${r.color_pages ?? '-'}`);
  }

  async runSuppliesTask(): Promise<void> {
    await this.runKnownDevicesTask('SupplyTask', SUPPLIES_SCOPES, (r) => `K=${r.toner_black ?? '-'} C=${r.toner_cyan ?? '-'} M=${r.toner_magenta ?? '-'} Y=${r.toner_yellow ?? '-'} alerts=${r.supplies_details?.alerts?.length ?? 0}`);
  }

  private async runKnownDevicesTask(label: string, scopes: readonly CaptureScope[], summarize: (r: DeviceReading) => string): Promise<void> {
    try {
      if (isBackpressureActive()) {
        log('WARN', `Backpressure activo (>10k lecturas pendientes). [${label}] omitido.`);
        return;
      }

      const config = this.deps.getConfig();
      const devices = getKnownDevices();
      if (devices.length === 0) return;
      log('INFO', `[${label}] ${isBusinessHours() ? 'horario laboral' : 'fuera de horario'} — ${devices.length} dispositivo(s)`);

      const queue = [...devices];
      const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const d = queue.shift();
          if (!d) break;
          try {
            const out = await captureDevice({ ip: d.ip, ...snmpArgsFor(config, d), scopes, hint: hintFrom(d), trustHint: true });
            if (!out || !out.result) continue; // apagada / sin respuesta: no encolar lecturas vacías
            const reading = out.reading;
            const hasData = reading.total_pages !== null || reading.toner_black != null || reading.toner_cyan != null
              || reading.toner_magenta != null || reading.toner_yellow != null || !!reading.supplies_details;
            if (!hasData) continue;
            if (!reading.serial && d.serial) reading.serial = d.serial;
            enqueueReading(reading);
            upsertKnownDevice(d.ip, { pollMethod: reading.poll_method, driver: out.driver.profile?.id ?? out.driver.family.id, snmpCredId: out.credentialId });
            log('INFO', `[${label}] [${d.ip}] ${summarize(reading)} method=${reading.poll_method}`);
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
