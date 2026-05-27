import snmp from 'net-snmp';
import net from 'net';
import {
  detectBrandFromOid, detectBrandFromText, OID_MAPS, GENERIC_OIDS, SYS_OIDS, HR_STATUS_MAP, HR_DEVICE_PRINTER, type Brand,
} from './oids';
import { readDeviceViaPJL } from './pjl';
import { readDeviceViaEWS, readDeviceCountersViaEWS, readDeviceSuppliesViaEWS } from './ews';
import { readDeviceViaIPP } from './ipp';

export type PollMethod = 'snmp' | 'pjl' | 'ews' | 'ipp' | 'unknown';

const TIMEOUT_MS         = 3000;
const RETRIES            = 1;
const MAX_CONCURRENT     = 20;
const REACH_TIMEOUT      = 500;   // fast check for printer-exclusive ports (9100, 631)
const WEB_REACH_TIMEOUT  = 2000;  // old EWS servers (Samsung SyncThru) can take >500ms to accept TCP

// Printer-exclusive ports: 9100 (JetDirect/PJL), 631 (IPP).
// Routers, switches and NAS never listen on these.
const PORT_JETDIRECT = 9100;
const PORT_IPP       = 631;
const PRINTER_PORTS  = [PORT_JETDIRECT, PORT_IPP, 80, 443];

class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}
  acquire(): Promise<void> {
    if (this.current < this.max) { this.current++; return Promise.resolve(); }
    return new Promise<void>(r => this.queue.push(r as unknown as () => void)).then(() => { this.current++; });
  }
  release() { this.current--; this.queue.shift()?.(); }
}

const sem = new Semaphore(MAX_CONCURRENT);

function tryPort(ip: string, port: number, timeoutMs = REACH_TIMEOUT): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect',  () => finish(true));
    socket.once('timeout',  () => finish(false));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENETUNREACH' || err.code === 'EHOSTDOWN') {
        if (!settled) { settled = true; socket.destroy(); reject(err); }
      } else {
        finish(err.code === 'ECONNREFUSED');
      }
    });
    socket.connect(port, ip);
  });
}

// Returns the set of ports that responded, all probed in parallel.
// Web ports (80, 443) use WEB_REACH_TIMEOUT because old EWS firmware (Samsung SyncThru)
// can take longer than REACH_TIMEOUT to accept a TCP connection even though the port is open.
async function checkOpenPorts(ip: string): Promise<Set<number>> {
  const results = await Promise.all(
    PRINTER_PORTS.map(async p => ({
      p,
      open: await tryPort(ip, p, p === 80 || p === 443 ? WEB_REACH_TIMEOUT : REACH_TIMEOUT).catch(() => false),
    })),
  );
  return new Set(results.filter(r => r.open).map(r => r.p));
}

export interface DeviceReading {
  ip:             string;
  brand:          Brand;
  model:          string;
  sysDescr:       string;
  sysName:        string;
  serial:         string | null;
  total_pages:    number | null;
  mono_pages:     number | null;
  color_pages:    number | null;
  toner_black?:   number | null;
  toner_cyan?:    number | null;
  toner_magenta?: number | null;
  toner_yellow?:  number | null;
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
  cartridge_printed_black?:    number | null;
  cartridge_printed_cyan?:     number | null;
  cartridge_printed_magenta?:  number | null;
  cartridge_printed_yellow?:   number | null;
  cartridge_estimated_black?:    number | null;
  cartridge_estimated_cyan?:     number | null;
  cartridge_estimated_magenta?:  number | null;
  cartridge_estimated_yellow?:   number | null;
  time:           string;
  poll_method:    PollMethod;
}

function createSession(ip: string, community: string): snmp.Session {
  return snmp.createSession(ip, community, {
    timeout: TIMEOUT_MS,
    retries: RETRIES,
    version: snmp.Version2c,
  });
}

function snmpGet(session: snmp.Session, oid: string): Promise<number | string | null> {
  return new Promise(resolve => {
    session.get([oid], (err, varbinds) => {
      if (err || !varbinds?.length) { resolve(null); return; }
      const vb = varbinds[0];
      if (snmp.isVarbindError(vb)) { resolve(null); return; }
      const val = vb.value;
      if (val === null || val === undefined) { resolve(null); return; }
      if (Buffer.isBuffer(val)) return resolve(val.toString('utf8').replace(/\0/g, '').trim());
      resolve(val as number | string);
    });
  });
}

async function snmpGetFirstValid(session: snmp.Session, oids: string[]): Promise<number | string | null> {
  for (const oid of oids) {
    const val = await snmpGet(session, oid);
    // 0 is a valid counter value - do not skip it
    if (val !== null && val !== undefined) return val;
  }
  return null;
}

export function hrStatus(val: unknown): string {
  return HR_STATUS_MAP[Number(val)] ?? 'idle';
}

// ─── Orchestrator: EWS / PJL / SNMP / IPP cascade ───────────────────────────

/**
 * Orquestador principal de escaneo de dispositivos de impresion.
 * Implementa una cascada de descubrimiento inteligente y segura (EWS / PJL / SNMP / IPP).
 * 
 * 1. Primero verifica que puertos estan abiertos para determinar si es un dispositivo de red generico o una impresora.
 * 2. Si hay un `hintMethod` conocido de ciclos anteriores, intenta usarlo de forma directa como via rapida.
 * 3. Si no es impresora (puertos 9100 y 631 cerrados), utiliza unicamente SNMP con validacion de Printer-MIB
 *    para evitar activar alarmas de sistemas IDS (Intrusion Detection Systems) al escanear puertos HTTP.
 * 4. Si se confirma que es impresora, ejecuta la cascada con preferencia por metodos de alta fidelidad:
 *    EWS (Embedded Web Server) -> SNMP v2c -> PJL (Printer Job Language) -> IPP (Internet Printing Protocol).
 * 
 * @param {string} ip - Direccion IP del dispositivo a consultar.
 * @param {string} community - Nombre de la comunidad SNMP para autenticacion.
 * @param {PollMethod} [hintMethod] - Metodo exitoso previamente registrado para optimizacion de ciclos.
 * @returns {Promise<DeviceReading | null>} Objeto de lectura con contadores y consumibles o null si falla.
 */
export async function readDevice(
  ip: string,
  community: string,
  hintMethod?: PollMethod,
): Promise<DeviceReading | null> {
  const openPorts = await checkOpenPorts(ip);
  if (openPorts.size === 0) return null;

  // Known method from a previous cycle - try it first to skip rediscovery
  if (hintMethod && hintMethod !== 'unknown') {
    // Self-healing: if stuck on SNMP but web port is open, ignore hint to attempt EWS upgrade
    const shouldIgnoreHint = hintMethod === 'snmp' && (openPorts.has(80) || openPorts.has(443));
    
    if (!shouldIgnoreHint) {
      const fast = hintMethod === 'snmp'
        ? await readViaSNMP(ip, community)
        : await readViaMethod(ip, hintMethod);
      if (fast) {
        // If we got rich counters, or if the hint method is already counter-rich (ews), use it!
        if (fast.mono_pages !== null || hintMethod === 'ews') {
          return fast;
        }
      }
      // Previous method stopped working or lacked detailed counters - fall through to full cascade
    }
  }

  // Port 9100 (JetDirect) and 631 (IPP) are printer-exclusive.
  // If neither is open the device is most likely a router/switch/NAS.
  // However, many printers (especially older models) only expose port 80 (EWS).
  const hasPrinterPort = openPorts.has(PORT_JETDIRECT) || openPorts.has(PORT_IPP);
  const hasWebPort     = openPorts.has(80) || openPorts.has(443);

  if (!hasPrinterPort && !hasWebPort) {
    // No printer-specific nor web ports open - SNMP only (validates via Printer-MIB)
    return readViaSNMP(ip, community);
  }

  // ── Case A: Printer-exclusive port confirmed → safe to go EWS-first ──
  if (hasPrinterPort) {
    // Perform a fast SNMP query to identify brand & model to optimize EWS candidate list
    const snmpResult = await readViaSNMP(ip, community);
    const brand = snmpResult?.brand ?? 'generic';
    const model = snmpResult?.model ?? '';

    if (hasWebPort) {
      const ews = await readViaEWS(ip, brand, model);
      if (ews?.total_pages !== null) return ews;
    }

    if (snmpResult?.total_pages !== null) return snmpResult;

    const pjl = await readViaPJL(ip);
    if (pjl?.total_pages !== null) return pjl;

    const ipp = await readViaIPP(ip);
    if (ipp) return ipp;

    return snmpResult ?? null;
  }

  // ── Case B: Only web port open (could be router/phone/NAS) ──
  // Use SNMP as a quick Printer-MIB filter first to avoid wasting
  // 4+ seconds of EWS timeouts on non-printer devices.
  const snmpResult = await readViaSNMP(ip, community);
  if (snmpResult) {
    // SNMP confirmed it's a printer → try EWS for richer data (toner, color split)
    const ews = await readViaEWS(ip, snmpResult.brand, snmpResult.model);
    if (ews?.total_pages !== null) return ews;
    return snmpResult;
  }

  return null;
}

// ─── Method 1: EWS (HTTP scraping, port 80/443) ──────────────────────────────

export async function readViaEWS(ip: string, brand?: Brand, model?: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaEWS(ip, brand, model);
  if (!data) return null;
  return {
    ip,
    brand:         data.brand,
    model:         (data.model ?? data.brand).slice(0, 100),
    sysDescr:      '',
    sysName:       '',
    serial:        data.serial ?? null,
    total_pages:   data.totalPages,
    mono_pages:    data.monoPages,
    color_pages:   data.colorPages,
    toner_black:   data.tonerBlack   ?? null,
    toner_cyan:    data.tonerCyan    ?? null,
    toner_magenta: data.tonerMagenta ?? null,
    toner_yellow:  data.tonerYellow  ?? null,
    cartridge_code_black:       data.cartridgeCodeBlack       ?? null,
    cartridge_code_cyan:        data.cartridgeCodeCyan        ?? null,
    cartridge_code_magenta:     data.cartridgeCodeMagenta     ?? null,
    cartridge_code_yellow:      data.cartridgeCodeYellow      ?? null,
    cartridge_serial_black:     data.cartridgeSerialBlack     ?? null,
    cartridge_serial_cyan:      data.cartridgeSerialCyan      ?? null,
    cartridge_serial_magenta:   data.cartridgeSerialMagenta   ?? null,
    cartridge_serial_yellow:    data.cartridgeSerialYellow    ?? null,
    cartridge_capacity_black:   data.cartridgeCapacityBlack   ?? null,
    cartridge_capacity_cyan:    data.cartridgeCapacityCyan    ?? null,
    cartridge_capacity_magenta: data.cartridgeCapacityMagenta ?? null,
    cartridge_capacity_yellow:  data.cartridgeCapacityYellow  ?? null,
    cartridge_printed_black:    data.cartridgePrintedBlack    ?? null,
    cartridge_printed_cyan:     data.cartridgePrintedCyan     ?? null,
    cartridge_printed_magenta:  data.cartridgePrintedMagenta  ?? null,
    cartridge_printed_yellow:   data.cartridgePrintedYellow   ?? null,
    cartridge_estimated_black:  data.cartridgeEstimatedBlack  ?? null,
    cartridge_estimated_cyan:   data.cartridgeEstimatedCyan   ?? null,
    cartridge_estimated_magenta: data.cartridgeEstimatedMagenta ?? null,
    cartridge_estimated_yellow:  data.cartridgeEstimatedYellow  ?? null,
    time:          new Date().toISOString(),
    poll_method:   'ews',
  };
}

// ─── Method 2: PJL (port 9100) ───────────────────────────────────────────────

export async function readViaPJL(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaPJL(ip);
  if (!data) return null;
  const brand = data.model ? detectBrandFromText(data.model) : 'generic';
  return {
    ip,
    brand,
    model:         (data.model ?? brand).slice(0, 100),
    sysDescr:      '',
    sysName:       '',
    serial:        data.serial ?? null,
    total_pages:   data.totalPages,
    mono_pages:    null,
    color_pages:   null,
    toner_black:   null,
    toner_cyan:    null,
    toner_magenta: null,
    toner_yellow:  null,
    time:          new Date().toISOString(),
    poll_method:   'pjl',
  };
}

// ─── Toner via Printer-MIB prtMarkerSuppliesTable (RFC 3805) ─────────────────

const SUPPLY_DESC  = '1.3.6.1.2.1.43.11.1.1.6.1';
const SUPPLY_MAX   = '1.3.6.1.2.1.43.11.1.1.8.1';
const SUPPLY_LEVEL = '1.3.6.1.2.1.43.11.1.1.9.1';

interface TonerLevels {
  toner_black:   number | null;
  toner_cyan:    number | null;
  toner_magenta: number | null;
  toner_yellow:  number | null;
}

async function readTonerViaSNMP(session: snmp.Session): Promise<TonerLevels> {
  const result: TonerLevels = { toner_black: null, toner_cyan: null, toner_magenta: null, toner_yellow: null };

  // Read all supply descriptions in parallel (indices 1-6 covers most printers)
  const descs = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      snmpGet(session, `${SUPPLY_DESC}.${i + 1}`).then(v => ({ idx: i + 1, v })),
    ),
  );

  const candidates = descs
    .filter(({ v }) => v !== null)
    .map(({ idx, v }) => {
      const s = String(v!).toLowerCase();
      let key: keyof TonerLevels | null = null;
      if      (/black|negro|noir|schwarz|nero|blk/i.test(s)) key = 'toner_black';
      else if (/cyan|cian/i.test(s))                          key = 'toner_cyan';
      else if (/magenta/i.test(s))                            key = 'toner_magenta';
      else if (/yellow|amarillo|jaune|gelb|giallo|yel/i.test(s)) key = 'toner_yellow';
      return key ? { idx, key } : null;
    })
    .filter(Boolean) as Array<{ idx: number; key: keyof TonerLevels }>;

  await Promise.all(
    candidates.map(async ({ idx, key }) => {
      if (result[key] !== null) return;
      const [max, level] = await Promise.all([
        snmpGet(session, `${SUPPLY_MAX}.${idx}`),
        snmpGet(session, `${SUPPLY_LEVEL}.${idx}`),
      ]);
      if (max === null || level === null) return;
      const maxN = Number(max); const lvlN = Number(level);
      if (lvlN === -3 && maxN > 0) { result[key] = 100; return; }
      if (lvlN < 0 || maxN <= 0) return;
      result[key] = Math.min(100, Math.max(0, Math.round((lvlN / maxN) * 100)));
    }),
  );

  return result;
}

// ─── Method 3: SNMP v2c (port 161 UDP) ───────────────────────────────────────

export async function readViaSNMP(ip: string, community: string): Promise<DeviceReading | null> {
  await sem.acquire();
  const session = createSession(ip, community);
  try {
    // Phase 1: quick filter by hrDeviceType.
    // If the device responds and is NOT a printer, discard immediately.
    const deviceType = await snmpGet(session, SYS_OIDS.hrDeviceType);
    if (deviceType !== null && String(deviceType) !== HR_DEVICE_PRINTER) return null;

    // Phase 2: confirm Printer-MIB presence (RFC 3805).
    // prtGeneralConfigChanges OID only exists on actual printers.
    if (deviceType === null) {
      const printerMibProbe = await snmpGet(session, '1.3.6.1.2.1.43.5.1.1.1.1');
      if (printerMibProbe === null) return null;
    }

    // Phase 3: identify brand
    const sysOid = await snmpGet(session, SYS_OIDS.sysObjectID);
    if (!sysOid) return null;

    const brand  = detectBrandFromOid(String(sysOid));
    const oidMap = OID_MAPS[brand];

    // Phase 4: read identity fields
    const [sysDescr, sysName] = await Promise.all([
      snmpGet(session, SYS_OIDS.sysDescr),
      snmpGet(session, SYS_OIDS.sysName),
    ]);

    const serialOids = brand !== 'generic' ? oidMap.serial : GENERIC_OIDS.serial;
    const serial = await snmpGetFirstValid(session, serialOids);

    const total_pages = await snmpGetFirstValid(session, brand !== 'generic' ? oidMap.totalPages : GENERIC_OIDS.totalPages);
    const mono_pages  = await snmpGetFirstValid(session, brand !== 'generic' ? oidMap.monoPages  : GENERIC_OIDS.monoPages);
    const color_pages = await snmpGetFirstValid(session, brand !== 'generic' ? oidMap.colorPages : GENERIC_OIDS.colorPages);
    const toners      = await readTonerViaSNMP(session);

    // Phase 5: clean up sysDescr noise
    const raw     = String(sysDescr ?? '').trim();
    let cleaned   = raw.split(/[;|\r\n,]/)[0].trim();
    cleaned       = cleaned.split(/version|kernel|firmware/i)[0].trim();

    let finalBrand = brand;
    if (finalBrand === 'generic') finalBrand = detectBrandFromText(raw);

    return {
      ip,
      brand:         finalBrand,
      sysDescr:      raw.slice(0, 255),
      sysName:       String(sysName ?? ''),
      serial:        serial ? String(serial).trim() || null : null,
      total_pages:   total_pages !== null ? Number(total_pages) : null,
      mono_pages:    mono_pages  !== null ? Number(mono_pages)  : null,
      color_pages:   color_pages !== null ? Number(color_pages) : null,
      toner_black:   toners.toner_black,
      toner_cyan:    toners.toner_cyan,
      toner_magenta: toners.toner_magenta,
      toner_yellow:  toners.toner_yellow,
      model:         cleaned.slice(0, 100),
      time:          new Date().toISOString(),
      poll_method:   'snmp',
    };
  } finally {
    session.close();
    sem.release();
  }
}

// ─── Method 4: IPP (port 631) ────────────────────────────────────────────────

export async function readViaIPP(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaIPP(ip);
  if (!data) return null;
  const brand = data.model ? detectBrandFromText(data.model) : 'generic';
  return {
    ip,
    brand,
    model:         (data.model ?? data.name ?? brand).slice(0, 100),
    sysDescr:      '',
    sysName:       data.name ?? '',
    serial:        data.serial ?? null,
    total_pages:   null,
    mono_pages:    null,
    color_pages:   null,
    toner_black:   null,
    toner_cyan:    null,
    toner_magenta: null,
    toner_yellow:  null,
    time:          new Date().toISOString(),
    poll_method:   'ipp',
  };
}

// ─── Targeted re-scan wrappers for known devices ─────────────────────────────
// Used by meterLoop and suppliesLoop in main.ts.
// Skip port detection and brand identification — brand is already known from DB.

export async function readViaEWSCounters(ip: string, brand?: Brand, model?: string): Promise<DeviceReading | null> {
  const data = await readDeviceCountersViaEWS(ip, brand);
  if (!data) return null;
  return {
    ip,
    brand:         data.brand,
    model:         (data.model ?? model ?? data.brand).slice(0, 100),
    sysDescr:      '',
    sysName:       '',
    serial:        data.serial,
    total_pages:   data.totalPages,
    mono_pages:    data.monoPages,
    color_pages:   data.colorPages,
    toner_black:   null,
    toner_cyan:    null,
    toner_magenta: null,
    toner_yellow:  null,
    time:          new Date().toISOString(),
    poll_method:   'ews',
  };
}

export async function readViaEWSSupplies(ip: string, brand?: Brand, model?: string): Promise<DeviceReading | null> {
  const data = await readDeviceSuppliesViaEWS(ip, brand);
  if (!data) return null;
  return {
    ip,
    brand:         data.brand,
    model:         (data.model ?? model ?? data.brand).slice(0, 100),
    sysDescr:      '',
    sysName:       '',
    serial:        data.serial,
    total_pages:   null,
    mono_pages:    null,
    color_pages:   null,
    toner_black:   data.tonerBlack   ?? null,
    toner_cyan:    data.tonerCyan    ?? null,
    toner_magenta: data.tonerMagenta ?? null,
    toner_yellow:  data.tonerYellow  ?? null,
    cartridge_code_black:        data.cartridgeCodeBlack       ?? null,
    cartridge_code_cyan:         data.cartridgeCodeCyan        ?? null,
    cartridge_code_magenta:      data.cartridgeCodeMagenta     ?? null,
    cartridge_code_yellow:       data.cartridgeCodeYellow      ?? null,
    cartridge_serial_black:      data.cartridgeSerialBlack     ?? null,
    cartridge_serial_cyan:       data.cartridgeSerialCyan      ?? null,
    cartridge_serial_magenta:    data.cartridgeSerialMagenta   ?? null,
    cartridge_serial_yellow:     data.cartridgeSerialYellow    ?? null,
    cartridge_capacity_black:    data.cartridgeCapacityBlack   ?? null,
    cartridge_capacity_cyan:     data.cartridgeCapacityCyan    ?? null,
    cartridge_capacity_magenta:  data.cartridgeCapacityMagenta ?? null,
    cartridge_capacity_yellow:   data.cartridgeCapacityYellow  ?? null,
    cartridge_printed_black:     data.cartridgePrintedBlack    ?? null,
    cartridge_printed_cyan:      data.cartridgePrintedCyan     ?? null,
    cartridge_printed_magenta:   data.cartridgePrintedMagenta  ?? null,
    cartridge_printed_yellow:    data.cartridgePrintedYellow   ?? null,
    cartridge_estimated_black:   data.cartridgeEstimatedBlack  ?? null,
    cartridge_estimated_cyan:    data.cartridgeEstimatedCyan   ?? null,
    cartridge_estimated_magenta: data.cartridgeEstimatedMagenta ?? null,
    cartridge_estimated_yellow:  data.cartridgeEstimatedYellow  ?? null,
    time:          new Date().toISOString(),
    poll_method:   'ews',
  };
}

// ─── Helper for hint-method fast path ────────────────────────────────────────

function readViaMethod(ip: string, method: PollMethod): Promise<DeviceReading | null> {
  switch (method) {
    case 'pjl': return readViaPJL(ip);
    case 'ews': return readViaEWS(ip);
    case 'ipp': return readViaIPP(ip);
    default:    return Promise.resolve(null);
  }
}
