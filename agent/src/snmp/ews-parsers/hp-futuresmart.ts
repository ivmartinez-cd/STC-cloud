/**
 * Parsers del EWS de HP FutureSmart (LaserJet Managed/Enterprise E-series, M5xx/M6xx, Flow MFP).
 * Las páginas internas exponen cada dato con un `id` estable (independiente del idioma del panel):
 *   /hp/device/DeviceInformation/View                       → ProductName, DeviceModel (SKU), DeviceSerialNumber, DeviceLocation, Alias
 *   /hp/device/InternalPages/Index?id=ConfigurationPage      → FirmwareRevision, FirmwareDateCode, FutureSmartBundleVersion, EngineCycles…
 *   /hp/device/InternalPages/Index?id=UsagePage              → UsagePage.* (impresiones por función/tamaño, equivalentes A4, dúplex, escaneos)
 *   /hp/device/InternalPages/Index?id=SuppliesStatus         → <Color>Cartridge1-* (nivel, part number, serial, páginas, fechas)
 * Validado contra un HP Color LaserJet MFP E47528 (FutureSmart 5, firmware 2509515_000481).
 */
import type { EwsData, SuppliesItem, DetailedCounters, CounterTriple, DeviceExtraInfo, InputTrayInfo } from './types';
import { classifySupplyOrigin } from '../../capture/supplyOrigin';

/** Texto inmediato del elemento con ese id (`<strong id="X">valor</strong>`, `<td id="X">valor`, etc.). */
export function idText(html: string, id: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`id="${esc}"[^>]*>\\s*([^<]*)`, 'i'));
  const t = m ? decode(m[1]).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return t.length ? t : null;
}

function decode(s: string): string {
  return s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/gi, '"');
}

/** "1,053" → 1053 · "1.053,0" → 1053 · "1,053.0" → 1053 · "829.0" → 829 · "30%" → 30 */
export function fsNum(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  let t = s.replace(/[%\s*]/g, '').replace(/[^\d.,-]+$/g, '');
  if (!t || !/\d/.test(t)) return null;
  if (/^\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(t) && (t.match(/[.,]/g) ?? []).length >= 2) {
    // dos separadores distintos: el último es decimal
    const lastSep = t[Math.max(t.lastIndexOf('.'), t.lastIndexOf(','))];
    const other = lastSep === '.' ? ',' : '.';
    t = t.split(other).join('').replace(lastSep, '.');
    // si el "decimal" tiene 3 dígitos era un separador de miles más
    if (/\.\d{3}$/.test(t)) t = t.replace('.', '');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
    t = t.replace(/[.,]/g, '');
  } else {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ─── DeviceInformation/View ──────────────────────────────────────────────────

export function parseFsDeviceInformation(html: string): Partial<EwsData> {
  const model  = idText(html, 'ProductName');
  const sku    = idText(html, 'DeviceModel');
  const serial = idText(html, 'DeviceSerialNumber');
  const loc    = idText(html, 'DeviceLocation');
  const alias  = html.match(/Alias:?\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*([^<]{1,60})/i)?.[1]?.trim() ?? idText(html, 'HomeDeviceName');
  const assetNumber = idText(html, 'AssetNumber');
  if (!model && !serial && !sku) return {};
  const device: DeviceExtraInfo = { manufacturer: 'HP' };
  if (sku)   device.sku = sku;
  if (alias) device.alias = alias;
  if (assetNumber) device.assetNumber = assetNumber;
  return {
    brand: 'hp',
    model: model ?? undefined,
    serial: serial ?? undefined,
    location: loc ?? undefined,
    hostname: alias ?? undefined,
    suppliesDetails: { device },
  };
}

// ─── ConfigurationPage ───────────────────────────────────────────────────────

export interface FsConfiguration {
  firmwareRevision?: string | null;
  firmwareDate?:     string | null;
  firmwarePackage?:  string | null;
  platform?:         string | null;
  formatterNumber?:  string | null;
  ramMb?:            number | null;
  engineCycles?:     number | null;
  colorEngineCycles?: number | null;
  trays?:            InputTrayInfo[];
  model?:            string | null;
  sku?:              string | null;
  serial?:           string | null;
}

export function parseFsConfiguration(html: string): FsConfiguration {
  const out: FsConfiguration = {
    firmwareRevision:  idText(html, 'FirmwareRevision'),
    firmwareDate:      idText(html, 'FirmwareDateCode') ?? html.match(/fecha del firmware:?\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*(\d{8})/i)?.[1] ?? null,
    firmwarePackage:   idText(html, 'FutureSmartBundleVersion') ?? idText(html, 'FirmwareBundleVersion'),
    platform:          idText(html, 'FutureSmartLevel'),
    formatterNumber:   idText(html, 'FormatterNumber'),
    ramMb:             fsNum(idText(html, 'TotalMemory')?.replace(/MB.*/i, '') ?? null),
    engineCycles:      fsNum(idText(html, 'EngineCycles')),
    colorEngineCycles: fsNum(idText(html, 'ColorEngineCycles')),
    model:             idText(html, 'ProductName'),
    sku:               idText(html, 'ModelNumber'),
    serial:            idText(html, 'SerialNumber'),
  };
  const trays: InputTrayInfo[] = [];
  for (let i = 1; i <= 8; i++) {
    const size = idText(html, `TraySize_${i}`);
    const type = idText(html, `TrayType_${i}`);
    if (!size && !type) continue;
    trays.push({ name: `Tray ${i}`, paperSize: size, paperType: type });
  }
  if (trays.length) out.trays = trays;
  return out;
}

// ─── UsagePage ───────────────────────────────────────────────────────────────

function triple(html: string, prefix: string, keys: [string, string, string]): CounterTriple | undefined {
  const mono = fsNum(idText(html, `${prefix}.${keys[0]}`));
  const color = fsNum(idText(html, `${prefix}.${keys[1]}`));
  const total = fsNum(idText(html, `${prefix}.${keys[2]}`));
  if (mono === null && color === null && total === null) return undefined;
  return { mono, color, total };
}

/** Totales por función desde la tabla por tamaño de papel (los ids de sección están localizados: Imprimir/Print, Copiar/Copy, Fax). */
function byMediaTotals(html: string): { print?: CounterTriple; copy?: CounterTriple; fax?: CounterTriple } {
  const out: { print?: CounterTriple; copy?: CounterTriple; fax?: CounterTriple } = {};
  const rx = /id="UsagePage\.ImpressionsByMediaSizeTable\.([^".]+)\.(MonochromeTotal|ColorTotal|TotalTotal)"[^>]*>\s*([^<]*)/gi;
  const acc = new Map<string, CounterTriple>();
  for (const m of html.matchAll(rx)) {
    const section = m[1]; const key = m[2]; const v = fsNum(m[3]);
    const t = acc.get(section) ?? {};
    if (key === 'MonochromeTotal') t.mono = v; else if (key === 'ColorTotal') t.color = v; else t.total = v;
    acc.set(section, t);
  }
  for (const [section, t] of acc) {
    if (/^(Imprimir|Print|Impresi|Druck|Impress|Stampa)/i.test(section)) out.print = t;
    else if (/^(Copiar|Copy|Kopie|Copia)/i.test(section)) out.copy = t;
    else if (/^Fax/i.test(section)) out.fax = t;
  }
  return out;
}

export function parseFsUsagePage(html: string): Partial<EwsData> {
  if (!/UsagePage\./.test(html)) return {};
  const counters: DetailedCounters = {};
  const media = byMediaTotals(html);
  const eq = 'UsagePage.EquivalentImpressionsTable';
  counters.print = media.print ?? triple(html, `${eq}.Print`, ['Monochrome', 'Color', 'Total']);
  counters.copy  = media.copy  ?? triple(html, `${eq}.Copy`,  ['Monochrome', 'Color', 'Total']);
  counters.fax   = media.fax   ?? triple(html, `${eq}.Fax`,   ['Monochrome', 'Color', 'Total']);
  counters.equivalentA4 = triple(html, eq, ['Monochrome.Total', 'Color.Total', 'Total.Total']);
  counters.duplexEquivalent = triple(html, 'UsagePage.EquivalentDuplexImpressionsTable.Duplex', ['Monochrome', 'Color', 'Total']);
  const sc = 'UsagePage.ScanCountsDestinationTable';
  const scans = {
    copy:  fsNum(idText(html, `${sc}.Copy.Value`)),
    send:  fsNum(idText(html, `${sc}.Send.Value`)),
    fax:   fsNum(idText(html, `${sc}.Fax.Value`)),
    total: fsNum(idText(html, `${sc}.GrandTotal.Value`)),
  };
  if (scans.total !== null || scans.send !== null || scans.copy !== null) counters.scans = scans;
  for (const k of Object.keys(counters) as Array<keyof DetailedCounters>) if (counters[k] === undefined) delete counters[k];
  if (!Object.keys(counters).length) return {};
  // Contadores "de páginas" de respaldo (si SNMP no responde): suma de funciones de la tabla por tamaño.
  const p = counters.print, c = counters.copy, f = counters.fax;
  const sum = (k: keyof CounterTriple) => [p, c, f].reduce<number | null>((a, t) => (t?.[k] == null ? a : (a ?? 0) + (t[k] as number)), null);
  return {
    brand: 'hp',
    totalPages: sum('total') ?? undefined,
    monoPages:  sum('mono')  ?? undefined,
    colorPages: sum('color') ?? undefined,
    suppliesDetails: { counters },
  };
}

// ─── SuppliesStatus ──────────────────────────────────────────────────────────

const FS_COLORS = ['Black', 'Cyan', 'Magenta', 'Yellow'] as const;

function cartridgeBlock(html: string, color: string): SuppliesItem | null {
  const p = `${color}Cartridge1`;
  const level = fsNum(idText(html, `${p}-Header_Level`));
  const part  = idText(html, `${p}-InstalledPartNumber`);
  if (level === null && !part) return null;
  const state = idText(html, `${p}-SupplyState`);
  const headerIdx = html.search(new RegExp(`id="${p}-Header"`, 'i'));
  const window = headerIdx >= 0 ? html.slice(headerIdx, headerIdx + 2500) : '';
  const order = window.match(/(?:Pedir|Order|Bestell|Commander)[^<]{0,20}?<[^>]*>\s*([A-Z0-9]{5,12}(?:\s*\([A-Z0-9]+\))?)/i)?.[1]
    ?? window.match(/(?:Pedir|Order)\s+([A-Z0-9]{5,12})/i)?.[1] ?? null;
  const code = part ? (part.match(/\(([A-Z0-9]+)\)/)?.[1] ?? part) : null;
  return {
    percentage:       level,
    status:           state ?? (level === null ? null : level <= 0 ? 'Empty' : level <= 10 ? 'Low' : 'Ready'),
    code,
    orderNumber:      order && order !== code ? order : null,
    serial:           idText(html, `${p}-SerialNumber`),
    printed:          fsNum(idText(html, `${p}-PagesPrintedWithSupply`)),
    remainingPages:   fsNum(idText(html, `${p}-EstimatedPagesRemaining`)),
    firstInstallDate: idText(html, `${p}-FirstInstallDate`),
    lastUseDate:      idText(html, `${p}-LastUseDate`),
    // Fase 10 del gap analysis vs HP SDS — `SupplyState` es donde el EWS de
    // HP suele mostrar "Genuine HP"/"Non-HP supply in use"/"Used or refilled".
    origin:           classifySupplyOrigin(state),
  };
}

export function parseFsSuppliesStatus(html: string): Partial<EwsData> {
  if (!/Cartridge1-Header/i.test(html)) return {};
  const toners: NonNullable<NonNullable<EwsData['suppliesDetails']>['toners']> = {};
  const out: Partial<EwsData> = { brand: 'hp' };
  for (const color of FS_COLORS) {
    const item = cartridgeBlock(html, color);
    if (!item) continue;
    const k = color.toLowerCase() as 'black' | 'cyan' | 'magenta' | 'yellow';
    toners[k] = item;
    const K = color as 'Black' | 'Cyan' | 'Magenta' | 'Yellow';
    if (item.percentage != null)   out[`toner${K}`] = item.percentage;
    if (item.code)                 out[`cartridgeCode${K}`] = item.code;
    if (item.serial)               out[`cartridgeSerial${K}`] = item.serial;
    if (item.printed != null)      out[`cartridgePrinted${K}`] = item.printed;
    if (item.remainingPages != null) out[`cartridgeEstimated${K}`] = item.remainingPages;
  }
  // Kits de mantenimiento (fusor, rodillos, kit de transferencia…) cuando la página los lista con el mismo patrón.
  const other: Array<{ name: string; percentage?: number | null; status?: string | null }> = [];
  for (const m of html.matchAll(/id="((?!(?:Black|Cyan|Magenta|Yellow)Cartridge)[A-Za-z]+(?:Kit|Unit|Roller|Fuser|Drum|Belt|Container)\d*)-Header_Level"[^>]*>\s*([^<]*)/gi)) {
    const name = idText(html, `${m[1]}-Header`) ?? m[1];
    other.push({ name, percentage: fsNum(m[2]), status: idText(html, `${m[1]}-SupplyState`) });
  }
  if (!Object.keys(toners).length && !other.length) return {};
  out.suppliesDetails = { toners: Object.keys(toners).length ? toners : undefined, maintenance: other.length ? { other } : undefined };
  return out;
}
