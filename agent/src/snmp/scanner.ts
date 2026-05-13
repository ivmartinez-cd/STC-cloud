import snmp from 'net-snmp';
import {
  detectBrandFromOid, detectBrandFromText, OID_MAPS, GENERIC_OIDS, SYS_OIDS, HR_STATUS_MAP, HR_DEVICE_PRINTER, type Brand,
} from './oids';

const TIMEOUT_MS     = 3000;
const RETRIES        = 1;
const MAX_CONCURRENT = 20;

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

export interface DeviceReading {
  ip:         string;
  brand:      Brand;
  model:      string;
  sysDescr:   string;
  sysName:    string;
  serial:     string | null;
  total_pages: number | null;
  mono_pages:  number | null;
  color_pages: number | null;
  time:       string;
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
    // IMPORTANTE: 0 es un valor válido para contadores, no debemos saltarlo
    if (val !== null && val !== undefined) return val;
  }
  return null;
}

export function hrStatus(val: unknown): string {
  return HR_STATUS_MAP[Number(val)] ?? 'idle';
}

export async function readDevice(ip: string, community: string): Promise<DeviceReading | null> {
  await sem.acquire();
  const session = createSession(ip, community);
  try {
    // ── Fase 1: Filtro rápido por hrDeviceType ──────────────────────────────
    // Si el dispositivo responde hrDeviceType y NO es impresora → descartar.
    // Si no responde (null) → pasar a Fase 2.
    const deviceType = await snmpGet(session, SYS_OIDS.hrDeviceType);
    if (deviceType !== null && String(deviceType) !== HR_DEVICE_PRINTER) {
      // Definitivamente NO es una impresora (PC, servidor, switch con HR-MIB)
      return null;
    }

    // ── Fase 2: Verificar presencia de Printer-MIB ──────────────────────────
    // El OID prtGeneralConfigChanges (1.3.6.1.2.1.43.5.1.1.1.1) solo existe
    // en dispositivos que implementan la Printer-MIB (RFC 3805).
    // Si no responde → no es impresora, descartar silenciosamente.
    if (deviceType === null) {
      const printerMibProbe = await snmpGet(session, '1.3.6.1.2.1.43.5.1.1.1.1');
      if (printerMibProbe === null) {
        // No tiene HR-MIB ni Printer-MIB → definitivamente no es impresora
        return null;
      }
    }

    // ── Fase 3: Identificar Fabricante ───────────────────────────────────────
    const sysOid = await snmpGet(session, SYS_OIDS.sysObjectID);
    if (!sysOid) return null;

    const brand  = detectBrandFromOid(String(sysOid));
    const oidMap = OID_MAPS[brand];

    // ── Fase 4: Consulta de Datos ───────────────────────────────────────────
    const [sysDescr, sysName] = await Promise.all([
      snmpGet(session, SYS_OIDS.sysDescr),
      snmpGet(session, SYS_OIDS.sysName),
    ]);

    const serialOids = brand !== 'generic' ? oidMap.serial : GENERIC_OIDS.serial;
    const totalOids  = brand !== 'generic' ? oidMap.totalPages : GENERIC_OIDS.totalPages;
    const monoOids   = brand !== 'generic' ? oidMap.monoPages : GENERIC_OIDS.monoPages;
    const colorOids  = brand !== 'generic' ? oidMap.colorPages : GENERIC_OIDS.colorPages;

    const serial = await snmpGetFirstValid(session, serialOids);
    let totalPages = await snmpGetFirstValid(session, totalOids) as number | null;

    let [monoPages, colorPages] = await Promise.all([
      snmpGetFirstValid(session, monoOids) as Promise<number | null>,
      snmpGetFirstValid(session, colorOids) as Promise<number | null>,
    ]);

    // Inferir contadores faltantes usando aritmética básica (Total = Mono + Color)
    if (totalPages === null && monoPages !== null && colorPages !== null) {
      totalPages = Number(monoPages) + Number(colorPages);
    } else if (totalPages !== null && colorPages !== null && monoPages === null) {
      monoPages = Math.max(0, Number(totalPages) - Number(colorPages));
    } else if (totalPages !== null && monoPages !== null && colorPages === null) {
      colorPages = Math.max(0, Number(totalPages) - Number(monoPages));
    }

    // ── Fase 5: Limpieza de "Basura" (Fabricante + Modelo únicamente) ────────
    const raw = String(sysDescr ?? '').trim();
    
    // 1. Cortar en el primer separador o palabra clave técnica
    let cleaned = raw.split(/[;|\r\n,]/)[0].trim();
    
    // Limpiar descriptores de versión/kernel que a veces vienen pegados
    cleaned = cleaned.split(/version|kernel|firmware/i)[0].trim();

    // 2. Intentar detectar marca por texto si el OID falló
    let finalBrand = brand;
    if (finalBrand === 'generic') {
      finalBrand = detectBrandFromText(raw);
    }

    return {
      ip,
      brand: finalBrand,
      sysDescr:   raw.slice(0, 255),
      sysName:    String(sysName  ?? ''),
      serial:     serial ? String(serial).trim() || null : null,
      total_pages: totalPages !== null ? Number(totalPages) : null,
      mono_pages:  monoPages  !== null ? Number(monoPages)  : null,
      color_pages: colorPages !== null ? Number(colorPages) : null,
      model:      cleaned.slice(0, 100), // Solo Fabricante + Modelo
      time:       new Date().toISOString(),
    };
  } finally {
    session.close();
    sem.release();
  }
}
