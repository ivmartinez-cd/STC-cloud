import { log } from './Logger';
import { ipRange } from './NetworkUtils';
import { isBusinessHours } from './BusinessHours';
import { readDevice, readViaEWSCounters, readViaEWSSupplies, readViaSNMP, type DeviceReading } from '../snmp/scanner';
import { enqueueReading, pendingCount, upsertKnownDevice, isRegistered, getKnownPollMethod, getKnownDevices, getKnownDeviceInfo } from '../sync/database';
import type { AgentConfig } from './config';

interface ScanServiceDeps {
  getConfig: () => AgentConfig;
}

export class ScanService {
  private deps: ScanServiceDeps;
  private _isScanning = false;
  private _lastScanErrors = 0;

  constructor(deps: ScanServiceDeps) {
    this.deps = deps;
  }

  get isScanning(): boolean {
    return this._isScanning;
  }

  get lastScanErrors(): number {
    return this._lastScanErrors;
  }

  async scan(): Promise<void> {
    if (this._isScanning) return;
    this._isScanning = true;

    const config = this.deps.getConfig();

    try {
      if (pendingCount() > 10_000) {
        log('WARN', 'Backpressure activo (>10k lecturas pendientes). Scan omitido.');
        return;
      }

      log('INFO', `Iniciando scan de ${config.ipRanges.length} rango(s)`);
      let errors = 0;
      const CONCURRENCY_LIMIT = 10;

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
              const reading = await readDevice(ip, config.snmpCommunity, hintMethod, false);
              if (!reading) continue;

              if (!isRegistered(ip)) {
                const ok = await this.registerDevice(config, reading);
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

      this._lastScanErrors = errors;
      log('INFO', `Scan completado. Pendientes en cola: ${pendingCount()} | Errores: ${errors}`);
    } finally {
      this._isScanning = false;
    }
  }

  async runMeterTask(): Promise<void> {
    try {
      const config = this.deps.getConfig();
      const devices = getKnownDevices();
      if (devices.length === 0) return;

      log('INFO', `[MeterTask] ${isBusinessHours() ? 'horario laboral' : 'fuera de horario'} — ${devices.length} dispositivo(s)`);

      const queue = [...devices];
      const workers = Array(Math.min(10, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const d = queue.shift();
          if (!d) break;
          try {
            const info = getKnownDeviceInfo(d.ip);
            let reading: DeviceReading | null = null;
            let methodUsed: 'ews' | 'snmp' | null = null;

            if (d.poll_method !== 'snmp') {
              reading = await readViaEWSCounters(d.ip, d.brand as Parameters<typeof readViaEWSCounters>[1], info?.model ?? undefined);
              if (reading) methodUsed = 'ews';
            }
            if (!reading) {
              reading = await readViaSNMP(d.ip, config.snmpCommunity);
              if (reading) methodUsed = 'snmp';
            }
            if (reading) {
              if (!reading.serial && info?.serial) {
                reading.serial = info.serial;
              }
              enqueueReading(reading);
              log('INFO', `[MeterTask] [${d.ip}] total=${reading.total_pages ?? '-'} mono=${reading.mono_pages ?? '-'} method=${methodUsed}`);

              // Retroalimentacion EWS-First
              if (methodUsed === 'ews') {
                upsertKnownDevice(d.ip, { pollMethod: 'ews' });
              }
            }
          } catch { /* continue */ }
        }
      });
      await Promise.all(workers);
    } catch (e: unknown) {
      log('WARN', `[MeterTask] Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async runSuppliesTask(): Promise<void> {
    try {
      const devices = getKnownDevices().filter(d => d.poll_method === 'ews' || d.poll_method === 'unknown' || d.poll_method === null);
      if (devices.length === 0) return;

      log('INFO', `[SupplyTask] ${isBusinessHours() ? 'horario laboral' : 'fuera de horario'} — ${devices.length} dispositivo(s) EWS`);

      const queue = [...devices];
      const workers = Array(Math.min(10, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const d = queue.shift();
          if (!d) break;
          try {
            const info = getKnownDeviceInfo(d.ip);
            const reading = await readViaEWSSupplies(d.ip, d.brand as Parameters<typeof readViaEWSSupplies>[1], info?.model ?? undefined);
            if (reading) {
              if (!reading.serial && info?.serial) {
                reading.serial = info.serial;
              }
              enqueueReading(reading);
              log('INFO', `[SupplyTask] [${d.ip}] K=${reading.toner_black ?? '-'} C=${reading.toner_cyan ?? '-'} M=${reading.toner_magenta ?? '-'} Y=${reading.toner_yellow ?? '-'}`);
              upsertKnownDevice(d.ip, { pollMethod: 'ews' });
            }
          } catch { /* continue */ }
        }
      });
      await Promise.all(workers);
    } catch (e: unknown) {
      log('WARN', `[SupplyTask] Error: ${e instanceof Error ? e.message : String(e)}`);
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
}
