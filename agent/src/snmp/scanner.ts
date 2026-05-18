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
const REACH_TIMEOUT  = 500; // ms para el pre-check TCP

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

// Nota: no usa ICMP para compatibilidad con redes que bloquean ping.
// Puerto 631 (IPP) añadido para detectar impresoras sin SNMP.
const PRINTER_PORTS = [9100, 80, 443, 631];

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

async function isHostReachable(ip: string): Promise<boolean> {
  const results = await Promise.all(PRINTER_PORTS.map(p => tryPort(ip, p).catch(() => false)));
  return results.some(Boolean);
}

export interface DeviceReading {
  ip:          string;
  brand:       Brand;
  model:       string;
  sysDescr:    string;
  sysName:     string;
  serial:      string | null;
  total_pages: number | null;
  mono_pages:  number | null;
  color_pages: number | null;
  time:        string;
  poll_method: PollMethod;
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
    // IMPORTANTE: 0 es un valor valido para contadores, no debemos saltarlo
    if (val !== null && val !== undefined) return val;
  }
  return null;
}

export function hrStatus(val: unknown): string {
  return HR_STATUS_MAP[Number(val)] ?? 'idle';
}

// ─── Orquestador: cascada SNMP → PJL → EWS → IPP ────────────────────────────

export async function readDevice(
  ip: string,
  community: string,
  hintMethod?: PollMethod,
): Promise<DeviceReading | null> {
  // Pre-check fuera del semaforo: descarta IPs sin respuesta en 500ms
  // antes de ocupar un slot de concurrencia con un timeout de 3s.
  if (!await isHostReachable(ip)) return null;

  // Si hay un método conocido por ciclos anteriores, intentarlo primero (evita redescubrimiento)
  if (hintMethod && hintMethod !== 'unknown') {
    const fast = hintMethod === 'snmp'
      ? await readViaSNMP(ip, community)
      : await readViaMethod(ip, hintMethod);
    if (fast) return fast;
    // El método previo dejó de funcionar → renegociar con cascada completa
  }

  // Cascada con prioridad de contadores: preferimos cualquier método que devuelva contadores (total_pages)
  const ews = await readViaEWS(ip);
  if (ews && ews.total_pages !== null) return ews;

  const ipp = await readViaIPP(ip);
  if (ipp && ipp.total_pages !== null) return ipp;

  const pjl = await readViaPJL(ip);
  if (pjl && pjl.total_pages !== null) return pjl;

  const snmp = await readViaSNMP(ip, community);
  if (snmp && snmp.total_pages !== null) return snmp;

  // Fallback: si ningún método tiene contadores, retornar el primero con información parcial
  return ews ?? ipp ?? pjl ?? snmp ?? null;
}

// ─── Método 1: SNMP v2c ───────────────────────────────────────────────────────

async function readViaSNMP(ip: string, community: string): Promise<DeviceReading | null> {
  await sem.acquire();
  const session = createSession(ip, community);
  try {
    // ── Fase 1: Filtro rapido por hrDeviceType ──────────────────────────────
    // Si el dispositivo responde hrDeviceType y NO es impresora → descartar.
    // Si no responde (null) → pasar a Fase 2.
    const deviceType = await snmpGet(session, SYS_OIDS.hrDeviceType);
    if (deviceType !== null && String(deviceType) !== HR_DEVICE_PRINTER) {
      return null; // Definitivamente NO es una impresora
    }

    // ── Fase 2: Verificar presencia de Printer-MIB ──────────────────────────
    // El OID prtGeneralConfigChanges (1.3.6.1.2.1.43.5.1.1.1.1) solo existe
    // en dispositivos que implementan la Printer-MIB (RFC 3805).
    if (deviceType === null) {
      const printerMibProbe = await snmpGet(session, '1.3.6.1.2.1.43.5.1.1.1.1');
      if (printerMibProbe === null) return null; // No tiene HR-MIB ni Printer-MIB
    }

    // --- Fase 3: Identificar Fabricante ---
    const sysOid = await snmpGet(session, SYS_OIDS.sysObjectID);
    if (!sysOid) return null;

    const brand  = detectBrandFromOid(String(sysOid));
    const oidMap = OID_MAPS[brand];

    // --- Fase 4: Consulta de Datos ---
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

    // Inferir contadores faltantes usando aritmetica basica (Total = Mono + Color)
    if (totalPages === null && monoPages !== null && colorPages !== null) {
      totalPages = Number(monoPages) + Number(colorPages);
    } else if (totalPages !== null && colorPages !== null && monoPages === null) {
      monoPages = Math.max(0, Number(totalPages) - Number(colorPages));
    } else if (totalPages !== null && monoPages !== null && colorPages === null) {
      colorPages = Math.max(0, Number(totalPages) - Number(monoPages));
    }

    // --- Fase 5: Limpieza de "Basura" ---
    const raw = String(sysDescr ?? '').trim();
    let cleaned = raw.split(/[;|\r\n,]/)[0].trim();
    cleaned = cleaned.split(/version|kernel|firmware/i)[0].trim();

    let finalBrand = brand;
    if (finalBrand === 'generic') finalBrand = detectBrandFromText(raw);

    return {
      ip,
      brand:       finalBrand,
      sysDescr:    raw.slice(0, 255),
      sysName:     String(sysName ?? ''),
      serial:      serial ? String(serial).trim() || null : null,
      total_pages: totalPages !== null ? Number(totalPages) : null,
      mono_pages:  monoPages  !== null ? Number(monoPages)  : null,
      color_pages: colorPages !== null ? Number(colorPages) : null,
      model:       cleaned.slice(0, 100),
      time:        new Date().toISOString(),
      poll_method: 'snmp',
    };
  } finally {
    session.close();
    sem.release();
  }
}

// ─── Método 2: PJL (puerto 9100) ─────────────────────────────────────────────

async function readViaPJL(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaPJL(ip);
  if (!data) return null;
  const brand = data.model ? detectBrandFromText(data.model) : 'generic';
  return {
    ip,
    brand,
    model:       (data.model ?? brand).slice(0, 100),
    sysDescr:    '',
    sysName:     '',
    serial:      data.serial ?? null,
    total_pages: data.totalPages,
    mono_pages:  null,
    color_pages: null,
    time:        new Date().toISOString(),
    poll_method: 'pjl',
  };
}

// ─── Método 3: EWS (HTTP scraping, puerto 80/443) ────────────────────────────

async function readViaEWS(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaEWS(ip);
  if (!data) return null;
  return {
    ip,
    brand:       data.brand,
    model:       (data.model ?? data.brand).slice(0, 100),
    sysDescr:    '',
    sysName:     '',
    serial:      data.serial ?? null,
    total_pages: data.totalPages,
    mono_pages:  data.monoPages,
    color_pages: data.colorPages,
    time:        new Date().toISOString(),
    poll_method: 'ews',
  };
}

// ─── Método 4: IPP (puerto 631) ───────────────────────────────────────────────

async function readViaIPP(ip: string): Promise<DeviceReading | null> {
  const data = await readDeviceViaIPP(ip);
  if (!data) return null;
  const brand = data.model ? detectBrandFromText(data.model) : 'generic';
  return {
    ip,
    brand,
    model:       (data.model ?? data.name ?? brand).slice(0, 100),
    sysDescr:    '',
    sysName:     data.name ?? '',
    serial:      data.serial ?? null,
    total_pages: null,
    mono_pages:  null,
    color_pages: null,
    time:        new Date().toISOString(),
    poll_method: 'ipp',
  };
}

// ─── Helper para hint de método conocido ─────────────────────────────────────

function readViaMethod(ip: string, method: PollMethod): Promise<DeviceReading | null> {
  switch (method) {
    case 'pjl': return readViaPJL(ip);
    case 'ews': return readViaEWS(ip);
    case 'ipp': return readViaIPP(ip);
    default:    return Promise.resolve(null);
  }
}
