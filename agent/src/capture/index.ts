/**
 * Motor de captura: precalificación de puertos → identidad → resolución de driver → captura por scopes
 * → completado de huecos con Printer-MIB/PJL/IPP → normalización al contrato del servidor.
 *
 * Punto de entrada único para discovery y para los loops (meters/supplies/alerts):
 *   const out = await captureDevice({ ip, community, scopes: ['meters'], hint });
 */
import net from 'net';
import { readDeviceViaPJL } from '../snmp/pjl';
import { readDeviceViaIPP } from '../snmp/ipp';
import { detectBrandFromText } from '../snmp/oids';
import { fetchHttp } from './transport/http';
import { SnmpClient } from './transport/snmp';
import { snmpIdentity, genericPrinterMib } from './families/generic-printer-mib';
import { resolve, listFamilies, GENERIC_FAMILY } from './registry';
import { mergeResults } from './bridge';
import { toDeviceReading } from './normalize';
import type { CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap, ResolvedDriver, PollMethod } from './types';
import type { DeviceReading } from './reading';

export type { CaptureScope, DeviceIdentity, PortMap, ResolvedDriver, CaptureResult, PollMethod } from './types';
export type { DeviceReading } from './reading';
export { listFamilies, listProfiles, getFamily, getProfile, resolve } from './registry';

// ─── Precalificación de puertos ──────────────────────────────────────────────
const REACH_TIMEOUT_MS     = 500;   // 9100/631: puertos exclusivos de impresora, responden rápido
const WEB_REACH_TIMEOUT_MS = 2000;  // EWS viejos (SyncThru V4, JetDirect) aceptan TCP lento
const PROBE_HTTP_TIMEOUT   = 4000;  // sondas de identidad EWS (sin SNMP)
const MAX_CONCURRENT       = 20;

class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  acquire(): Promise<void> {
    if (this.current < this.max) { this.current++; return Promise.resolve(); }
    return new Promise<void>(r => this.queue.push(r)).then(() => { this.current++; });
  }
  release(): void { this.current--; this.queue.shift()?.(); }
}
const sem = new Semaphore(MAX_CONCURRENT);

function tryPort(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (r: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(r); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (err: NodeJS.ErrnoException) => finish(err.code === 'ECONNREFUSED' ? false : false));
    socket.connect(port, ip);
  });
}

export async function checkOpenPorts(ip: string): Promise<PortMap> {
  const [jetdirect, ipp, http, https] = await Promise.all([
    tryPort(ip, 9100, REACH_TIMEOUT_MS),
    tryPort(ip, 631,  REACH_TIMEOUT_MS),
    tryPort(ip, 80,   WEB_REACH_TIMEOUT_MS),
    tryPort(ip, 443,  WEB_REACH_TIMEOUT_MS),
  ]);
  return { jetdirect, ipp, http, https };
}

// ─── Identidad ───────────────────────────────────────────────────────────────

export interface CaptureHint {
  /** Driver (perfil o familia) persistido en `known_devices.driver`. */
  driver?:  string | null;
  brand?:   string | null;
  model?:   string | null;
  serial?:  string | null;
  /** Método con el que se leyó la última vez (sólo informativo). */
  pollMethod?: PollMethod | null;
}

export interface CaptureOptions {
  ip:        string;
  community: string;
  scopes:    readonly CaptureScope[];
  hint?:     CaptureHint;
  /** Si true, confía en el hint (marca/modelo/serial) y no re-identifica por red. Para loops. */
  trustHint?: boolean;
  log?:      CaptureContext['log'];
}

export interface CaptureOutcome {
  reading:  DeviceReading;
  identity: DeviceIdentity;
  driver:   ResolvedDriver;
  ports:    PortMap;
  result:   CaptureResult | null;
}

async function identify(ip: string, ports: PortMap, snmp: SnmpClient, log?: CaptureContext['log']): Promise<DeviceIdentity | null> {
  // 1. SNMP (barato: 2 PDUs para descartar no-impresoras)
  const viaSnmp = await snmpIdentity(ip, snmp);
  if (viaSnmp) return viaSnmp;

  const hasWeb = ports.http || ports.https;

  // 2. Sondas EWS de las familias (sólo si hay puerto de impresora o web). Timeout corto.
  if (hasWeb) {
    const http = (path: string, protocol: 'http' | 'https' = 'http') => fetchHttp(ip, path, protocol, 0, PROBE_HTTP_TIMEOUT);
    const base = { ip, community: '', ports, http, snmp, pjl: () => readDeviceViaPJL(ip), ipp: () => readDeviceViaIPP(ip), log };
    // Todas las sondas en paralelo (1 request c/u); gana la primera válida según la prioridad de familias.
    const families = listFamilies().filter(f => f.probeIdentity);
    const probes = await Promise.all(families.map(f => f.probeIdentity!(base).catch(() => null)));
    for (let i = 0; i < families.length; i++) {
      const p = probes[i];
      if (p && (p.model || p.serial)) {
        log?.('DEBUG', `[${ip}] identidad via ${families[i].id}`);
        const textBrand = detectBrandFromText(p.model ?? '');
        return { ip, brand: textBrand !== 'generic' ? textBrand : (p.brand ?? families[i].brand), model: p.model ?? null, serial: p.serial ?? null, mac: p.mac ?? null, hostname: p.hostname ?? null, location: p.location ?? null, firmware: p.firmware ?? null, sku: p.sku ?? null, source: 'ews' };
      }
    }
  }
  // 3. PJL INFO ID (9100)
  if (ports.jetdirect) {
    const pjl = await readDeviceViaPJL(ip);
    if (pjl && (pjl.model || pjl.serial)) {
      return { ip, brand: detectBrandFromText(pjl.model ?? ''), model: pjl.model, serial: pjl.serial, source: 'pjl' };
    }
  }
  // 4. IPP Get-Printer-Attributes (631)
  if (ports.ipp) {
    const ipp = await readDeviceViaIPP(ip);
    if (ipp && (ipp.model || ipp.serial || ipp.name)) {
      return { ip, brand: detectBrandFromText(ipp.model ?? ipp.name ?? ''), model: ipp.model ?? ipp.name, serial: ipp.serial, sysName: ipp.name, source: 'ipp' };
    }
  }
  return null;
}

// ─── Captura ─────────────────────────────────────────────────────────────────

function isBrand(b: string | null | undefined): b is DeviceIdentity['brand'] {
  return ['hp', 'lexmark', 'samsung', 'ricoh', 'brother', 'xerox', 'generic'].includes(String(b));
}

function needs(result: CaptureResult | null, scope: CaptureScope): boolean {
  if (!result) return true;
  switch (scope) {
    case 'identity': return !result.identity?.serial || !result.identity?.model;
    case 'meters':   return result.meters?.total == null;
    case 'supplies': return !result.supplies || Object.keys(result.supplies.toners).length === 0;
    case 'alerts':   return !result.alerts;
    case 'trays':    return !result.trays || !(result.trays.input ?? []).some(t => t.capacity != null || t.level != null);
  }
}

/**
 * Captura un dispositivo. Devuelve `null` si el host no es una impresora o no respondió a ningún protocolo.
 */
export async function captureDevice(opts: CaptureOptions): Promise<CaptureOutcome | null> {
  await sem.acquire();
  const snmp = new SnmpClient(opts.ip, opts.community);
  try {
    const ports = await checkOpenPorts(opts.ip);

    // Identidad
    let identity: DeviceIdentity | null = null;
    if (opts.trustHint && opts.hint?.driver && (opts.hint.model || opts.hint.serial)) {
      identity = {
        ip: opts.ip,
        brand: isBrand(opts.hint.brand) ? opts.hint.brand : 'generic',
        model: opts.hint.model ?? null,
        serial: opts.hint.serial ?? null,
        source: opts.hint.pollMethod ?? 'unknown',
      };
    } else {
      identity = await identify(opts.ip, ports, snmp, opts.log);
      if (!identity) return null;
      // SNMP no respondió a la identificación (bloqueado por política del cliente): no gastar timeouts en el resto
      // del ciclo — el EWS es la fuente (identidad, contadores por EngineCycles/counters.json, insumos, alertas).
      if (identity.source !== 'snmp') snmp.markUnreachable();
    }

    const driver = resolve(identity, ports, opts.hint?.driver);
    const ctx: CaptureContext = {
      ip: opts.ip,
      community: opts.community,
      ports,
      identity,
      http: (path, protocol = 'http') => fetchHttp(opts.ip, path, protocol),
      snmp,
      pjl: () => readDeviceViaPJL(opts.ip),
      ipp: () => readDeviceViaIPP(opts.ip),
      profile: driver.profile,
      log: opts.log,
    };

    // 1. Familia (o hook de reemplazo del perfil)
    let result: CaptureResult | null = null;
    try {
      result = driver.profile?.hooks?.collect
        ? await driver.profile.hooks.collect(ctx, opts.scopes)
        : await driver.family.collect(ctx, opts.scopes);
    } catch (e: unknown) {
      opts.log?.('WARN', `[${opts.ip}] ${driver.family.id}: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 2. Completar huecos con Printer-MIB (si la familia no era ya la genérica)
    const missing = opts.scopes.filter(s => needs(result, s));
    if (missing.length && driver.family.id !== GENERIC_FAMILY.id && !snmp.unreachable) {
      try {
        const fill = await genericPrinterMib.collect(ctx, missing);
        result = mergeResults(result, fill);
      } catch { /* best effort */ }
    }
    // 3. PJL como último recurso para el total
    if (opts.scopes.includes('meters') && result?.meters?.total == null && ports.jetdirect) {
      const pjl = await readDeviceViaPJL(opts.ip);
      if (pjl?.totalPages != null) {
        result = mergeResults(result, { method: 'pjl', meters: { total: pjl.totalPages, mono: null, color: null, source: 'pjl' }, identity: { serial: pjl.serial } });
      }
    }
    // 4. IPP para completar identidad
    if (opts.scopes.includes('identity') && (!identity.serial && !result?.identity?.serial) && ports.ipp) {
      const ipp = await readDeviceViaIPP(opts.ip);
      if (ipp?.serial || ipp?.model) result = mergeResults(result, { method: 'ipp', identity: { serial: ipp.serial, model: ipp.model } });
    }

    // 5. Hook post-proceso del perfil
    if (result && driver.profile?.hooks?.afterCollect) {
      try { result = await driver.profile.hooks.afterCollect(result, ctx); } catch { /* ignore */ }
    }

    if (!result && opts.scopes.some(s => s !== 'identity')) {
      // Conocemos el dispositivo pero no pudimos leer nada en este ciclo.
      return { reading: toDeviceReading(identity, null, driver.profile), identity, driver, ports, result: null };
    }

    // El método principal es el que aportó los contadores; si no hubo contadores, el de la identidad.
    if (result && !result.meters && result.method === 'snmp' && identity.source !== 'snmp') result.method = identity.source;
    const reading = toDeviceReading(identity, result, driver.profile);
    return { reading, identity, driver, ports, result };
  } finally {
    snmp.close();
    sem.release();
  }
}
