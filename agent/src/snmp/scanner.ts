import snmp from 'net-snmp';
import net from 'net';
import {
  detectBrandFromOid, detectBrandFromText, OID_MAPS, GENERIC_OIDS, SYS_OIDS, HR_STATUS_MAP, HR_DEVICE_PRINTER, type Brand,
} from './oids';
import { readDeviceViaPJL } from './pjl';
import { readDeviceViaEWS } from './ews';
import { readDeviceViaIPP } from './ipp';

export type PollMethod = 'snmp' | 'pjl' | 'ews' | 'ipp' | 'unknown';

const TIMEOUT_MS     = 3000;
const RETRIES        = 1;
const MAX_CONCURRENT = 20;
const REACH_TIMEOUT  = 500;

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

function tryPort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(REACH_TIMEOUT);
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
async function checkOpenPorts(ip: string): Promise<Set<number>> {
  const results = await Promise.all(
    PRINTER_PORTS.map(async p => ({ p, open: await tryPort(ip, p).catch(() => false) })),
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
  time:           string;
  poll_method:    PollMethod;
}

function createSession(ip: string, community: string) {
  return snmp.createSession(ip, community, {
    timeout: TIMEOUT_MS,
    retries: RETRIES,
    version: (snmp as any).Version2c,
  });
}

function snmpGet(session: any, oid: string): Promise<number | string | null> {
  return new Promise(resolve => {
    session.get([oid], (err: any, varbinds: any[]) => {
      if (err || !varbinds?.length) { resolve(null); return; }
      const vb = varbinds[0];
      if ((snmp as any).isVarbindError(vb)) { resolve(null); return; }
      const val = vb.value;
      if (val === null || val === undefined) { resolve(null); return; }
      if (Buffer.isBuffer(val)) return resolve(val.toString('utf8').replace(/\0/g, '').trim());
      resolve(val as number | string);
    });
  });
}

async function snmpGetFirstValid(session: any, oids: string[]): Promise<number | string | null> {
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

export async function readDevice(
  ip: string,
  community: string,
  hintMethod?: PollMethod,
): Promise<DeviceReading | null> {
  const openPorts = await checkOpenPorts(ip);
  if (openPorts.size === 0) return null;

  // Known method from a previous cycle - try it first to skip rediscovery
  if (hintMethod && hintMethod !== 'unknown') {
    const fast = hintMethod === 'snmp'
      ? await readViaSNMP(ip, community)
      : await readViaMethod(ip, hintMethod);
    if (fast) {
      // If we got rich counters, or if the hint method is already counter-rich (ews/snmp), use it!
      if (fast.mono_pages !== null || hintMethod === 'ews' || hintMethod === 'snmp') {
        return fast;
      }
    }
    // Previous method stopped working or lacked detailed counters - fall through to full cascade
  }

  // Port 9100 (JetDirect) and 631 (IPP) are printer-exclusive.
  // If neither is open the device is most likely a router/switch/NAS.
  // In that case only SNMP is attempted: it validates via Printer-MIB
  // internally and never touches port 80, so it won't alarm IDS systems.
  const hasPrinterPort = openPorts.has(PORT_JETDIRECT) || openPorts.has(PORT_IPP);
  if (!hasPrinterPort) {
    return readViaSNMP(ip, community);
  }

  // Printer confirmed - safe to use all methods.
  // Prefer counter-rich results; fall back to partial data if nothing has counters.
  const ews = await readViaEWS(ip);
  if (ews?.total_pages !== null) return ews;

  const pjl = await readViaPJL(ip);
  if (pjl?.total_pages !== null) return pjl;

  const snmpResult = await readViaSNMP(ip, community);
  if (snmpResult?.total_pages !== null) return snmpResult;

  const ipp = await readViaIPP(ip);
  if (ipp) return ipp;

  return ews ?? pjl ?? snmpResult ?? null;
}

// ─── Method 1: EWS (HTTP scraping, port 80/443) ──────────────────────────────

async function readViaEWS(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaEWS(ip);
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
    time:          new Date().toISOString(),
    poll_method:   'ews',
  };
}

// ─── Method 2: PJL (port 9100) ───────────────────────────────────────────────

async function readViaPJL(ip: string): Promise<DeviceReading | null> {
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

async function readTonerViaSNMP(session: any): Promise<TonerLevels> {
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

async function readViaSNMP(ip: string, community: string): Promise<DeviceReading | null> {
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

    // Phase 4: read counters and identity fields
    const [sysDescr, sysName] = await Promise.all([
      snmpGet(session, SYS_OIDS.sysDescr),
      snmpGet(session, SYS_OIDS.sysName),
    ]);

    const serialOids = brand !== 'generic' ? oidMap.serial     : GENERIC_OIDS.serial;
    const totalOids  = brand !== 'generic' ? oidMap.totalPages : GENERIC_OIDS.totalPages;
    const monoOids   = brand !== 'generic' ? oidMap.monoPages  : GENERIC_OIDS.monoPages;
    const colorOids  = brand !== 'generic' ? oidMap.colorPages : GENERIC_OIDS.colorPages;

    const serial = await snmpGetFirstValid(session, serialOids);
    let totalPages = await snmpGetFirstValid(session, totalOids) as number | null;

    let [monoPages, colorPages] = await Promise.all([
      snmpGetFirstValid(session, monoOids)  as Promise<number | null>,
      snmpGetFirstValid(session, colorOids) as Promise<number | null>,
    ]);

    // Infer missing counters (Total = Mono + Color)
    if (totalPages === null && monoPages !== null && colorPages !== null) {
      totalPages = Number(monoPages) + Number(colorPages);
    } else if (totalPages !== null && colorPages !== null && monoPages === null) {
      monoPages = Math.max(0, Number(totalPages) - Number(colorPages));
    } else if (totalPages !== null && monoPages !== null && colorPages === null) {
      colorPages = Math.max(0, Number(totalPages) - Number(monoPages));
    }

    // Phase 5: clean up sysDescr noise
    const raw     = String(sysDescr ?? '').trim();
    let cleaned   = raw.split(/[;|\r\n,]/)[0].trim();
    cleaned       = cleaned.split(/version|kernel|firmware/i)[0].trim();

    let finalBrand = brand;
    if (finalBrand === 'generic') finalBrand = detectBrandFromText(raw);

    let toner: TonerLevels = { toner_black: null, toner_cyan: null, toner_magenta: null, toner_yellow: null };
    try { toner = await readTonerViaSNMP(session); } catch { /* supply table unavailable */ }

    return {
      ip,
      brand:         finalBrand,
      sysDescr:      raw.slice(0, 255),
      sysName:       String(sysName ?? ''),
      serial:        serial ? String(serial).trim() || null : null,
      total_pages:   totalPages !== null ? Number(totalPages) : null,
      mono_pages:    monoPages  !== null ? Number(monoPages)  : null,
      color_pages:   colorPages !== null ? Number(colorPages) : null,
      toner_black:   toner.toner_black,
      toner_cyan:    toner.toner_cyan,
      toner_magenta: toner.toner_magenta,
      toner_yellow:  toner.toner_yellow,
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

async function readViaIPP(ip: string): Promise<DeviceReading | null> {
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

// ─── Helper for hint-method fast path ────────────────────────────────────────

function readViaMethod(ip: string, method: PollMethod): Promise<DeviceReading | null> {
  switch (method) {
    case 'pjl': return readViaPJL(ip);
    case 'ews': return readViaEWS(ip);
    case 'ipp': return readViaIPP(ip);
    default:    return Promise.resolve(null);
  }
}
