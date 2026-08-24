/**
 * Familia base: Printer-MIB (RFC 3805) + Host Resources MIB (RFC 2790) + Entity MIB (RFC 2737)
 * por SNMP v2c. Es la "red de seguridad" universal: cualquier impresora de red responde a esto.
 *
 * Qué resuelve y cómo (equivalente al colector SNMP de HP SDS / FMAudit):
 *  - identity : sysObjectID → marca; hrDeviceDescr / prtGeneralPrinterName / sysDescr → modelo;
 *               prtGeneralSerialNumber / entPhysicalSerialNum + OIDs privados → serie; sysName,
 *               sysLocation, entPhysicalFirmwareRev, ifPhysAddress.
 *  - meters   : prtMarkerLifeCount (total universal) + OIDs privados por marca para mono/color.
 *  - supplies : prtMarkerSuppliesTable (tipo/clase/nivel/máximo) cruzada con prtMarkerColorantTable
 *               para asignar color por índice de colorante (no por regex de descripción), con
 *               fallback a descripción multilingüe. Distingue tóner, tambor/OPC, fusor, banda, residuo.
 *  - alerts   : prtAlertTable (severidad/código/descripción) + bits de hrPrinterDetectedErrorState.
 *  - trays    : prtInputTable (nombre, capacidad, nivel, tamaño de papel).
 */
import { OID_MAPS, GENERIC_OIDS, SYS_OIDS, HR_DEVICE_PRINTER, detectBrandFromOid, detectBrandFromText } from '../../snmp/oids';
import type { CaptureFamily, CaptureContext, CaptureResult, CaptureScope, DeviceIdentity, PortMap, SuppliesReading, SuppliesItem, TonerColor, AlertItem, InputTrayInfo } from '../types';
import { toNum, toStr, formatMac, type SnmpClient } from '../transport/snmp';
import { clampPct } from '../transport/http';
import { classifySupplyOrigin } from '../supplyOrigin';

// ─── OIDs ────────────────────────────────────────────────────────────────────
const OID = {
  sysLocation:          '1.3.6.1.2.1.1.6.0',
  hrDeviceDescr:        '1.3.6.1.2.1.25.3.2.1.3.1',
  hrPrinterStatus:      '1.3.6.1.2.1.25.3.5.1.1.1',
  hrPrinterErrorState:  '1.3.6.1.2.1.25.3.5.1.2.1',
  hrSWInstalledName:    '1.3.6.1.2.1.25.6.3.1.2',
  prtGeneralPrinterName:'1.3.6.1.2.1.43.5.1.1.16.1',
  prtGeneralSerial:     '1.3.6.1.2.1.43.5.1.1.17.1',
  prtMarkerLifeCount:   '1.3.6.1.2.1.43.10.2.1.4.1.1',
  entSerial:            '1.3.6.1.2.1.47.1.1.1.1.11.1',
  entFirmwareRev:       '1.3.6.1.2.1.47.1.1.1.1.9.1',
  entSoftwareRev:       '1.3.6.1.2.1.47.1.1.1.1.10.1',
  ifPhysAddress:        '1.3.6.1.2.1.2.2.1.6',
  // prtMarkerSuppliesTable (índices hrDeviceIndex.supplyIndex)
  supClass:             '1.3.6.1.2.1.43.11.1.1.4',
  supType:              '1.3.6.1.2.1.43.11.1.1.5',
  supDescr:             '1.3.6.1.2.1.43.11.1.1.6',
  supUnit:              '1.3.6.1.2.1.43.11.1.1.7',
  supMax:               '1.3.6.1.2.1.43.11.1.1.8',
  supLevel:             '1.3.6.1.2.1.43.11.1.1.9',
  supColorant:          '1.3.6.1.2.1.43.11.1.1.3',
  // prtMarkerColorantTable
  colorantValue:        '1.3.6.1.2.1.43.12.1.1.4',
  // prtInputTable
  inputName:            '1.3.6.1.2.1.43.8.2.1.13',
  inputMaxCapacity:     '1.3.6.1.2.1.43.8.2.1.9',
  inputCurrentLevel:    '1.3.6.1.2.1.43.8.2.1.10',
  inputMediaName:       '1.3.6.1.2.1.43.8.2.1.12',
  inputStatus:          '1.3.6.1.2.1.43.8.2.1.11',
  // prtAlertTable
  alertSeverity:        '1.3.6.1.2.1.43.18.1.1.2',
  alertCode:            '1.3.6.1.2.1.43.18.1.1.7',
  alertDescr:           '1.3.6.1.2.1.43.18.1.1.8',
} as const;

/** prtMarkerSuppliesType (RFC 3805) */
const SUPPLY_TYPE = { toner: 3, wasteToner: 4, ink: 5, inkCartridge: 6, opc: 9, developer: 10, fuser: 15, transferUnit: 21, wasteInk: 8, solidWax: 7, ribbonWax: 8 } as const;
/** prtMarkerSuppliesClass */
const CLASS_CONSUMED = 3; // supplyThatIsConsumed
const CLASS_FILLED   = 4; // receptacleThatIsFilled (residuo)

const COLOR_RX: Array<[TonerColor, RegExp]> = [
  ['black',   /black|negro|noir|schwarz|nero|preto|\bblk\b|\bk\b|\bbk\b/i],
  ['cyan',    /cyan|cian|\bc\b/i],
  ['magenta', /magenta|\bm\b/i],
  ['yellow',  /yellow|amarillo|jaune|gelb|giallo|amarelo|\by\b/i],
];

function colorFromText(s: string | null): TonerColor | null {
  if (!s) return null;
  for (const [c, rx] of COLOR_RX) if (rx.test(s)) return c;
  return null;
}

/** Nivel % según RFC 3805 (-1 otro, -2 desconocido, -3 "hay algo" ⇒ tratar como OK). */
function pctFromLevel(level: number | null, max: number | null): number | null {
  if (level === null) return null;
  if (level === -3) return 100;
  if (level < 0) return null;
  if (max !== null && max > 0) return clampPct((level / max) * 100);
  if (level <= 100) return level;
  return null;
}

/**
 * Extrae el modelo de un IEEE 1284 Device ID ("MFG:HP;MDL:HP LaserJet Pro M428f;CMD:...")
 * o de un sysDescr HP con "PID:". `null` si el texto no tiene esa forma.
 */
export function modelFromDeviceId(raw: string | null): string | null {
  if (!raw) return null;
  // IEEE 1284: separador ';' (MDL:/MODEL:). sysDescr HP: separador ',' (PID:).
  const m = raw.match(/(?:^|;)\s*(?:MDL|MODEL)\s*:\s*([^;]+)/i) ?? raw.match(/(?:^|,)\s*PID\s*:\s*([^,;]+)/i);
  return m ? m[1].trim().slice(0, 100) : null;
}

/** Limpia sysDescr/hrDeviceDescr: se queda con el nombre comercial. */
export function cleanModel(raw: string | null): string | null {
  if (!raw) return null;
  const fromId = modelFromDeviceId(raw);
  if (fromId) return fromId;
  let s = raw.split(/[;|\r\n]/)[0].trim();
  s = s.split(/\b(?:version|firmware|fw|kernel|serial)\b/i)[0].trim();
  s = s.replace(/^(?:Hewlett[- ]Packard|HP)\s+/i, 'HP ').trim();
  return s.length >= 2 ? s.slice(0, 100) : null;
}

/** Descripciones de sysDescr que NO son modelo (tarjeta de red, firmware). */
const NON_MODEL_DESCR = /ETHERNET MULTI-ENVIRONMENT|JETDIRECT|Network Card|Print Server|Linux|Windows/i;

// ─── Identidad ───────────────────────────────────────────────────────────────

export async function snmpIdentity(ip: string, snmp: SnmpClient): Promise<DeviceIdentity | null> {
  const [deviceType, sysOid] = await snmp.getMany([SYS_OIDS.hrDeviceType, SYS_OIDS.sysObjectID]);
  if (deviceType === null && sysOid === null) return null;                 // SNMP no responde
  if (deviceType !== null && String(deviceType) !== HR_DEVICE_PRINTER) return null; // no es impresora
  if (deviceType === null) {
    // Sin hrDevice: confirmar Printer-MIB
    const probe = await snmp.get('1.3.6.1.2.1.43.5.1.1.1.1');
    if (probe === null) return null;
  }

  const brandByOid = detectBrandFromOid(String(sysOid ?? ''));
  const oidMap = OID_MAPS[brandByOid] ?? GENERIC_OIDS;

  const [sysDescr, sysName, hrDescr, prtName, location, fwRev, swRev] = await snmp.getMany([
    SYS_OIDS.sysDescr, SYS_OIDS.sysName, OID.hrDeviceDescr, OID.prtGeneralPrinterName, OID.sysLocation, OID.entFirmwareRev, OID.entSoftwareRev,
  ]);
  const serial = await snmp.getFirstStr([...oidMap.serial, OID.prtGeneralSerial, OID.entSerial]);

  const descr = toStr(sysDescr);
  const hrd   = toStr(hrDescr);
  // Modelo: hrDeviceDescr suele ser el nombre comercial ("HP LaserJet 600 M602"); sysDescr en HP viejos es la JetDirect.
  let model = cleanModel(hrd);
  if (!model || NON_MODEL_DESCR.test(model)) {
    const fromSys = cleanModel(descr);
    model = fromSys && !NON_MODEL_DESCR.test(fromSys) ? fromSys : (model ?? fromSys);
  }
  if ((!model || NON_MODEL_DESCR.test(model)) && toStr(prtName)) model = cleanModel(toStr(prtName));

  let brand = brandByOid;
  // El nombre comercial manda (HP LaserJet Pro M4xx fabricados por Samsung responden con enterprise 236).
  const textBrand = detectBrandFromText(model ?? '');
  if (textBrand !== 'generic' && /^(?:HP|Hewlett|Samsung|Lexmark|Ricoh|Brother|Xerox)\b/i.test(model ?? '')) brand = textBrand;
  else if (brand === 'generic') brand = detectBrandFromText(`${descr ?? ''} ${hrd ?? ''} ${model ?? ''}`);

  let mac: string | null = null;
  try {
    const ifs = await snmp.subtree(OID.ifPhysAddress, 8, true);
    for (const v of ifs.values()) { mac = formatMac(typeof v === 'string' ? Buffer.from(v, 'binary') : null); if (mac) break; }
  } catch { /* ignore */ }

  // Firmware: OIDs privados de la marca → Entity-MIB → hrSWInstalledName ("... Main Firmware V11.01.16") → sysDescr
  let firmware: string | null = toStr(fwRev) ?? toStr(swRev);
  const fwOids = (OID_MAPS[brand] ?? GENERIC_OIDS).firmware ?? [];
  if (fwOids.length) firmware = (await snmp.getFirstStr(fwOids)) ?? firmware;
  if (!firmware) {
    try {
      const sw = await snmp.subtree(OID.hrSWInstalledName, 8);
      for (const v of sw.values()) {
        const s = toStr(v);
        const m = s?.match(/(?:Main\s+Firmware|Firmware|System)\s+(V?[\w.\-]+)/i);
        if (m) { firmware = m[1]; break; }
      }
      if (!firmware) { const first = toStr([...sw.values()][0] ?? null); if (first && /V?\d+\.\d+/.test(first)) firmware = first.slice(0, 60); }
    } catch { /* ignore */ }
  }
  if (!firmware && descr) {
    const m = descr.match(/;\s*(V[\w.\-]+(?:\s+[A-Z]{3}-\d{2}-\d{4})?)/i) ?? descr.match(/\bversion\s+([\w.\-]+)/i) ?? descr.match(/\bfirmware\s+([\w.\-]+)/i);
    if (m) firmware = m[1];
  }

  return {
    ip, brand, model, serial,
    sysObjectId: toStr(sysOid),
    sysDescr:    descr?.slice(0, 255) ?? null,
    sysName:     toStr(sysName),
    hostname:    toStr(sysName),
    location:    toStr(location),
    firmware,
    mac,
    source: 'snmp',
  };
}

// ─── Contadores ──────────────────────────────────────────────────────────────

export async function snmpMeters(ctx: CaptureContext): Promise<CaptureResult['meters'] | undefined> {
  const brand  = ctx.identity.brand;
  const oidMap = OID_MAPS[brand] ?? GENERIC_OIDS;
  const [total, mono, color] = await Promise.all([
    ctx.snmp.getFirstInt(brand !== 'generic' ? oidMap.totalPages : GENERIC_OIDS.totalPages),
    ctx.snmp.getFirstInt(brand !== 'generic' ? oidMap.monoPages  : []),
    ctx.snmp.getFirstInt(brand !== 'generic' ? oidMap.colorPages : []),
  ]);
  if (total === null && mono === null && color === null) return undefined;
  return { total: total ?? (mono !== null ? mono + (color ?? 0) : null), mono, color, source: 'snmp' };
}

// ─── Insumos ─────────────────────────────────────────────────────────────────

interface SupplyRow { idx: string; cls: number | null; type: number | null; descr: string | null; max: number | null; level: number | null; colorant: number | null; }

async function readSupplyTable(snmp: SnmpClient): Promise<{ rows: SupplyRow[]; colorants: Map<string, string> }> {
  const [cls, type, descr, max, level, colorant, colorants] = await Promise.all([
    snmp.subtree(OID.supClass), snmp.subtree(OID.supType), snmp.subtree(OID.supDescr),
    snmp.subtree(OID.supMax), snmp.subtree(OID.supLevel), snmp.subtree(OID.supColorant),
    snmp.subtree(OID.colorantValue),
  ]);
  const idxs = new Set<string>([...descr.keys(), ...level.keys()]);
  const rows: SupplyRow[] = [];
  for (const idx of idxs) {
    rows.push({
      idx,
      cls:      toNum(cls.get(idx) ?? null),
      type:     toNum(type.get(idx) ?? null),
      descr:    toStr(descr.get(idx) ?? null),
      max:      toNum(max.get(idx) ?? null),
      level:    toNum(level.get(idx) ?? null),
      colorant: toNum(colorant.get(idx) ?? null),
    });
  }
  const colorantNames = new Map<string, string>();
  for (const [k, v] of colorants) { const s = toStr(v); if (s) colorantNames.set(k, s); }
  return { rows, colorants: colorantNames };
}

async function snmpSupplies(ctx: CaptureContext): Promise<SuppliesReading | undefined> {
  const { rows, colorants } = await readSupplyTable(ctx.snmp);
  if (!rows.length) return undefined;

  const toners: SuppliesReading['toners'] = {};
  const drums:  Partial<Record<TonerColor, SuppliesItem>> = {};
  const maintenance: NonNullable<SuppliesReading['maintenance']> = {};
  const other: NonNullable<NonNullable<SuppliesReading['maintenance']>['other']> = [];

  for (const r of rows) {
    const pct = pctFromLevel(r.level, r.max);
    const hrDev = r.idx.split('.')[0];
    const colorName = r.colorant !== null && r.colorant > 0 ? (colorants.get(`${hrDev}.${r.colorant}`) ?? null) : null;
    const color = colorFromText(colorName) ?? colorFromText(r.descr);
    const item: SuppliesItem = {
      percentage: pct, status: pct === null ? null : pct <= 0 ? 'Empty' : pct <= 10 ? 'Low' : 'Ready',
      origin: classifySupplyOrigin(r.descr),
    };
    const d = (r.descr ?? '').toLowerCase();

    const isToner = r.type === SUPPLY_TYPE.toner || r.type === SUPPLY_TYPE.ink || r.type === SUPPLY_TYPE.inkCartridge
      || (r.type === null && /toner|cartridge|cartucho|ink|tinta/.test(d) && !/drum|imaging|opc|waste|residu/.test(d));
    const isDrum  = r.type === SUPPLY_TYPE.opc || /drum|imaging|opc|tambor|unidad de imagen/.test(d);
    const isWaste = r.cls === CLASS_FILLED || r.type === SUPPLY_TYPE.wasteToner || r.type === SUPPLY_TYPE.wasteInk || /waste|residu/.test(d);
    const isFuser = r.type === SUPPLY_TYPE.fuser || /fuser|fusor/.test(d);
    const isBelt  = r.type === SUPPLY_TYPE.transferUnit || /transfer|banda/.test(d);

    if (isWaste)      { maintenance.wasteToner = maintenance.wasteToner ?? item; continue; }
    if (isFuser)      { maintenance.fuser      = maintenance.fuser      ?? item; continue; }
    if (isBelt)       { maintenance.transferBelt = maintenance.transferBelt ?? item; continue; }
    if (isDrum && color)  { if (!drums[color]) drums[color] = item; continue; }
    if (isDrum)           { other.push({ name: r.descr ?? 'Imaging unit', percentage: pct }); continue; }
    if (isToner && color) { if (!toners[color]) toners[color] = item; continue; }
    if (isToner)          { if (!toners.black) toners.black = item; continue; } // mono sin colorante declarado
    if (r.cls === CLASS_CONSUMED && r.descr) other.push({ name: r.descr, percentage: pct, maxCapacity: r.max, currentCount: r.level });
  }
  if (other.length) maintenance.other = other;

  const hasAny = Object.keys(toners).length || Object.keys(drums).length || Object.keys(maintenance).length;
  if (!hasAny) return undefined;
  return {
    toners,
    drums:       Object.keys(drums).length ? drums : undefined,
    maintenance: Object.keys(maintenance).length ? maintenance : undefined,
    source: 'snmp',
  };
}

// ─── Alertas ─────────────────────────────────────────────────────────────────

const ERROR_BITS: Array<[number, string, AlertItem['severity']]> = [
  [0, 'Low paper', 'WARNING'], [1, 'No paper', 'ERROR'], [2, 'Low toner', 'WARNING'], [3, 'No toner', 'ERROR'],
  [4, 'Door open', 'ERROR'], [5, 'Jammed', 'ERROR'], [6, 'Offline', 'WARNING'], [7, 'Service requested', 'ERROR'],
  [8, 'Input tray missing', 'WARNING'], [9, 'Output tray missing', 'WARNING'], [10, 'Marker supply missing', 'ERROR'],
  [11, 'Output near full', 'WARNING'], [12, 'Output full', 'ERROR'], [13, 'Input tray empty', 'WARNING'], [14, 'Overdue preventive maintenance', 'WARNING'],
];

async function snmpAlerts(ctx: CaptureContext): Promise<AlertItem[] | undefined> {
  const alerts: AlertItem[] = [];
  const now = new Date().toISOString();
  const [sev, code, descr] = await Promise.all([
    ctx.snmp.subtree(OID.alertSeverity, 32), ctx.snmp.subtree(OID.alertCode, 32), ctx.snmp.subtree(OID.alertDescr, 32),
  ]);
  for (const idx of new Set([...descr.keys(), ...code.keys()])) {
    const s = toNum(sev.get(idx) ?? null);
    const d = toStr(descr.get(idx) ?? null);
    const c = toNum(code.get(idx) ?? null);
    if (!d && c === null) continue;
    // prtAlertSeverityLevel: 1 other, 3 critical, 4 warning, 5 warningBinaryChangeEvent
    const severity: AlertItem['severity'] = s === 3 ? 'ERROR' : (s === 4 || s === 5) ? 'WARNING' : 'INFO';
    alerts.push({ code: c !== null ? String(c) : undefined, description: d ?? undefined, severity, time: now });
  }
  // hrPrinterDetectedErrorState: OCTET STRING de bits (bit 0 = MSB del primer byte)
  const err = await ctx.snmp.get(OID.hrPrinterErrorState, true);
  if (typeof err === 'string' && err.length) {
    const bytes = Buffer.from(err, 'binary');
    for (const [bit, label, severity] of ERROR_BITS) {
      const byte = bytes[Math.floor(bit / 8)];
      if (byte === undefined) continue;
      if (byte & (0x80 >> (bit % 8))) alerts.push({ code: `HR-${bit}`, description: label, severity, time: now });
    }
  }
  return alerts.length ? alerts : undefined;
}

// ─── Bandejas ────────────────────────────────────────────────────────────────

async function snmpTrays(ctx: CaptureContext): Promise<CaptureResult['trays'] | undefined> {
  const [name, max, level, media] = await Promise.all([
    ctx.snmp.subtree(OID.inputName, 16), ctx.snmp.subtree(OID.inputMaxCapacity, 16),
    ctx.snmp.subtree(OID.inputCurrentLevel, 16), ctx.snmp.subtree(OID.inputMediaName, 16),
  ]);
  const input: InputTrayInfo[] = [];
  for (const idx of new Set([...name.keys(), ...max.keys()])) {
    const n = toStr(name.get(idx) ?? null);
    const cap = toNum(max.get(idx) ?? null);
    const lvl = toNum(level.get(idx) ?? null);
    if (!n && cap === null) continue;
    const pct = lvl === null ? null : lvl === -3 ? 100 : lvl < 0 ? null : cap && cap > 0 ? clampPct((lvl / cap) * 100) : null;
    input.push({ name: n ?? `Tray ${idx.split('.').pop()}`, capacity: cap && cap > 0 ? cap : null, level: pct, paperSize: toStr(media.get(idx) ?? null), status: lvl === 0 ? 'Empty' : 'Ready' });
  }
  return input.length ? { input, source: 'snmp' } : undefined;
}

// ─── Familia ─────────────────────────────────────────────────────────────────

export const genericPrinterMib: CaptureFamily = {
  id: 'generic.printer-mib',
  brand: 'generic',
  displayName: 'Printer-MIB (RFC 3805) via SNMP',
  capabilities: ['identity', 'meters', 'supplies', 'alerts', 'trays'],
  score(identity: DeviceIdentity, _ports: PortMap): number {
    return identity.source === 'snmp' ? 10 : 1; // siempre aplica, con prioridad mínima
  },
  async collect(ctx: CaptureContext, scopes: readonly CaptureScope[]): Promise<CaptureResult | null> {
    if (ctx.snmp.unreachable) return null;
    const out: CaptureResult = { method: 'snmp' };
    if (scopes.includes('identity')) {
      const id = await snmpIdentity(ctx.ip, ctx.snmp);
      if (id) out.identity = id;
    }
    if (scopes.includes('meters'))   out.meters   = await snmpMeters(ctx);
    if (scopes.includes('supplies')) out.supplies = await snmpSupplies(ctx);
    if (scopes.includes('alerts'))   out.alerts   = await snmpAlerts(ctx);
    if (scopes.includes('trays'))    out.trays    = await snmpTrays(ctx);
    const empty = !out.identity && !out.meters && !out.supplies && !out.alerts && !out.trays;
    return empty ? null : out;
  },
};
