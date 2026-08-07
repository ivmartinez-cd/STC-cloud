import http  from 'http';
import https from 'https';
import zlib  from 'zlib';
import { detectBrandFromText, type Brand } from './oids';
import { type EwsData, type EwsCandidate } from './ews-parsers/types';

// Import parsers
import { parseSamsungSolutionHome, parseSamsungSolutionSupplies, parseSamsungSolutionCounters, parseSamsungHome, parseSamsungActiveAlert, parseSamsungFwUpgrade, parseSamsungIdentity, parseSamsungSyncThruSupplies, parseSamsungCounters, scanSamsungDevice } from './ews-parsers/samsung';
import { parseLexmarkPrinterStatus, parseLexmarkEws } from './ews-parsers/lexmark';
import { parseHpSupplies, parseHpXml, parseHpHtml, parseHpConsumablesXml, parseHpLegacyHtmlSupplies } from './ews-parsers/hp';
import { parseGeneric } from './ews-parsers/generic';

// Export types so external files don't need to change their imports
export type { EwsData };

const EWS_TIMEOUT = 10000;

// ─── URL candidates ordered by reliability ───────────────────────────────────

const CANDIDATES: EwsCandidate[] = [
  // Samsung Solution Web Service (newer models, e.g. X4300LX)
  { path: '/sws.application/home/homeDeviceInfo.sws',                   protocol: 'http', parse: parseSamsungSolutionHome,      brand: 'samsung', produces: 'supplies' },
  { path: '/sws.application/information/suppliesView.sws',               protocol: 'http', parse: parseSamsungSolutionSupplies,  brand: 'samsung', produces: 'supplies' },
  { path: '/sws.application/information/countersView.sws',               protocol: 'http', parse: parseSamsungSolutionCounters,  brand: 'samsung', produces: 'meters'   },
  // Samsung SyncThru: home, activealert, fwupgrade, identity, supplies, counters
  { path: '/sws/app/information/home/home.json',                        protocol: 'http', parse: parseSamsungHome,              brand: 'samsung'                        },
  { path: '/sws/app/information/activealert/activealert.json',          protocol: 'http', parse: parseSamsungActiveAlert,       brand: 'samsung', produces: 'supplies' },
  { path: '/sws/app/maintenance/fw/fwupgrade.json',                      protocol: 'http', parse: parseSamsungFwUpgrade,          brand: 'samsung'                        },
  { path: '/sws/app/information/identity/identity.json',                protocol: 'http', parse: parseSamsungIdentity,          brand: 'samsung'                        },
  { path: '/sws/app/information/supplies/supplies.json',                protocol: 'http', parse: parseSamsungSyncThruSupplies,  brand: 'samsung', produces: 'supplies' },
  { path: '/sws/app/information/counters/counters.json',                protocol: 'http', parse: parseSamsungCounters,          brand: 'samsung', produces: 'meters'   },
  // Lexmark PrinterStatus (toner levels)
  { path: '/cgi-bin/dynamic/printer/PrinterStatus.html',                protocol: 'http', parse: parseLexmarkPrinterStatus,     brand: 'lexmark', produces: 'supplies' },
  // Lexmark config/deviceinfo (page count + serial + model)
  { path: '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html',    protocol: 'http', parse: parseLexmarkEws,               brand: 'lexmark', produces: 'meters'   },
  // HP: supplies first (toner levels), then XML > HTML for page counters (supports HTTP & HTTPS)
  { path: '/DevMgmt/ConsumableConfigDyn.xml',                           protocol: 'http',  parse: parseHpConsumablesXml,        brand: 'hp',      produces: 'supplies' },
  { path: '/DevMgmt/ConsumableConfigDyn.xml',                           protocol: 'https', parse: parseHpConsumablesXml,        brand: 'hp',      produces: 'supplies' },
  { path: '/hp/device/InternalPages/Index?id=SuppliesStatus',           protocol: 'http',  parse: parseHpSupplies,              brand: 'hp',      produces: 'supplies' },
  { path: '/hp/device/InternalPages/Index?id=SuppliesStatus',           protocol: 'https', parse: parseHpSupplies,              brand: 'hp',      produces: 'supplies' },
  { path: '/info_suppliesStatus.html',                                   protocol: 'http',  parse: parseHpLegacyHtmlSupplies,    brand: 'hp',      produces: 'supplies' },
  { path: '/status/SuppliesStatus.htm',                                  protocol: 'http',  parse: parseHpLegacyHtmlSupplies,    brand: 'hp',      produces: 'supplies' },
  { path: '/hp/device/info_suppliesStatus.xml',                          protocol: 'http',  parse: parseHpConsumablesXml,        brand: 'hp',      produces: 'supplies' },
  { path: '/hp/device/InternalPages/Index?id=SuppliesDetails',          protocol: 'http',  parse: parseHpSupplies,              brand: 'hp',      produces: 'supplies' },
  { path: '/DevMgmt/ProductConfigDyn.xml',                              protocol: 'http',  parse: parseHpXml,                   brand: 'hp'                           },
  { path: '/DevMgmt/ProductConfigDyn.xml',                              protocol: 'https', parse: parseHpXml,                   brand: 'hp'                           },
  { path: '/DevMgmt/ProductUsageDyn.xml',                               protocol: 'http',  parse: parseHpXml,                   brand: 'hp',      produces: 'meters'   },
  { path: '/DevMgmt/ProductUsageDyn.xml',                               protocol: 'https', parse: parseHpXml,                   brand: 'hp',      produces: 'meters'   },
  { path: '/hp/device/InternalPages/Index?id=UsagePage',                protocol: 'http',  parse: parseHpHtml,                  brand: 'hp',      produces: 'meters'   },
  { path: '/hp/device/InternalPages/Index?id=UsagePage',                protocol: 'https', parse: parseHpHtml,                  brand: 'hp',      produces: 'meters'   },
  // Generic brands — produces unknown (parseGeneric extracts whatever is available)
  { path: '/web/entry.cgi?func=STR_PRTCNT',                             protocol: 'http', parse: parseGeneric,                  brand: 'ricoh'   },
  { path: '/general/status.html',                                        protocol: 'http', parse: parseGeneric,                  brand: 'brother' },
  { path: '/PRESENTATION/HTML/TOP/PRTINFO.HTML',                        protocol: 'http', parse: parseGeneric,                  brand: 'generic' },
  { path: '/English/pages/cnc_status.html',                             protocol: 'http', parse: parseGeneric,                  brand: 'generic' },
  { path: '/wcd/index.html',                                             protocol: 'http', parse: parseGeneric,                  brand: 'generic' },
  { path: '/cgi-bin/cgix/xerox/printerStat.cgi',                        protocol: 'http', parse: parseGeneric,                  brand: 'xerox'   },
];

export async function fetchSamsungSyncThruFull(ip: string): Promise<Partial<EwsData> | null> {
  const [homeBody, counterBody, fwBody, suppliesBody, alertBody] = await Promise.all([
    fetchHttp(ip, '/sws/app/information/home/home.json', 'http'),
    fetchHttp(ip, '/sws/app/information/counters/counters.json', 'http'),
    fetchHttp(ip, '/sws/app/maintenance/fw/fwupgrade.json', 'http'),
    fetchHttp(ip, '/sws/app/information/supplies/supplies.json', 'http'),
    fetchHttp(ip, '/sws/app/information/activealert/activealert.json', 'http'),
  ]);

  if (!homeBody && !counterBody && !suppliesBody) return null;

  const result: Partial<EwsData> = { brand: 'samsung' };

  if (homeBody) {
    const homeParsed = parseSamsungHome(homeBody);
    Object.assign(result, homeParsed);
  }

  if (counterBody) {
    const counterParsed = parseSamsungCounters(counterBody);
    if (counterParsed.totalPages != null) result.totalPages = counterParsed.totalPages;
    if (counterParsed.monoPages != null)  result.monoPages  = counterParsed.monoPages;
    if (counterParsed.colorPages != null) result.colorPages = counterParsed.colorPages;
    if (counterParsed.serial != null)     result.serial     = counterParsed.serial;
    if (counterParsed.suppliesDetails) {
      result.suppliesDetails = { ...result.suppliesDetails, ...counterParsed.suppliesDetails };
    }
  }

  if (fwBody) {
    const fwParsed = parseSamsungFwUpgrade(fwBody);
    if (fwParsed.firmware) result.firmware = fwParsed.firmware;
  }

  if (suppliesBody) {
    const suppliesParsed = parseSamsungSyncThruSupplies(suppliesBody);
    if (suppliesParsed.cartridgeCodeBlack)   result.cartridgeCodeBlack   = suppliesParsed.cartridgeCodeBlack;
    if (suppliesParsed.cartridgeSerialBlack) result.cartridgeSerialBlack = suppliesParsed.cartridgeSerialBlack;
    if (suppliesParsed.tonerBlack != null)   result.tonerBlack           = suppliesParsed.tonerBlack;
    if (suppliesParsed.suppliesDetails) {
      result.suppliesDetails = { ...result.suppliesDetails, ...suppliesParsed.suppliesDetails };
    }
  }

  if (alertBody) {
    const alertParsed = parseSamsungActiveAlert(alertBody);
    if (alertParsed.suppliesDetails?.alerts) {
      if (!result.suppliesDetails) result.suppliesDetails = {};
      result.suppliesDetails.alerts = alertParsed.suppliesDetails.alerts;
    }
  }

  return result;
}

export async function readDeviceViaEWS(ip: string, targetBrand?: Brand, targetModel?: string, identityOnly = false): Promise<EwsData | null> {
  if (targetBrand === 'samsung') {
    const samsungData = await scanSamsungDevice(ip, targetModel);
    if (samsungData && (samsungData.model || samsungData.serial)) {
      return {
        brand:                 samsungData.brand ?? 'samsung',
        model:                 samsungData.model ?? 'Samsung Printer',
        serial:                samsungData.serial ?? null,
        mac:                   samsungData.mac ?? null,
        hostname:              samsungData.hostname ?? null,
        location:              samsungData.location ?? null,
        totalPages:            samsungData.totalPages ?? null,
        monoPages:             samsungData.monoPages ?? null,
        colorPages:            samsungData.colorPages ?? null,
        tonerBlack:            samsungData.tonerBlack ?? null,
        tonerCyan:             samsungData.tonerCyan ?? null,
        tonerMagenta:          samsungData.tonerMagenta ?? null,
        tonerYellow:           samsungData.tonerYellow ?? null,
        firmware:              samsungData.firmware ?? null,
        cartridgeCodeBlack:    samsungData.cartridgeCodeBlack ?? null,
        cartridgeCodeCyan:     samsungData.cartridgeCodeCyan ?? null,
        cartridgeCodeMagenta:  samsungData.cartridgeCodeMagenta ?? null,
        cartridgeCodeYellow:   samsungData.cartridgeCodeYellow ?? null,
        cartridgeSerialBlack:  samsungData.cartridgeSerialBlack ?? null,
        cartridgeSerialCyan:   samsungData.cartridgeSerialCyan ?? null,
        cartridgeSerialMagenta: samsungData.cartridgeSerialMagenta ?? null,
        cartridgeSerialYellow: samsungData.cartridgeSerialYellow ?? null,
        cartridgeCapacityBlack: samsungData.cartridgeCapacityBlack ?? null,
        cartridgeCapacityCyan:  samsungData.cartridgeCapacityCyan ?? null,
        cartridgeCapacityMagenta: samsungData.cartridgeCapacityMagenta ?? null,
        cartridgeCapacityYellow:  samsungData.cartridgeCapacityYellow ?? null,
        suppliesDetails:       samsungData.suppliesDetails ?? null,
      };
    }
  }

  // Accumulates data across candidates so that model from one endpoint
  // can be combined with consumables from another.
  let acc: Partial<EwsData> = {};

  let candidatesToTry = CANDIDATES;

  if (targetBrand && targetBrand !== 'generic') {
    // Filter candidates to only try the matched brand (plus any brandless/generic ones)
    let filtered = CANDIDATES.filter(c => c.brand === targetBrand || !c.brand);
    
    // Samsung specific optimization: prioritize standard SyncThru JSON endpoints over SWS on older mono printers
    if (targetBrand === 'samsung') {
      const isCopier = /LX|FX|GX/i.test(targetModel ?? '');
      const samsungSws = filtered.filter(c => c.path.startsWith('/sws.application'));
      const samsungSyncThru = filtered.filter(c => c.path.startsWith('/sws/app'));
      
      if (isCopier) {
        // Only prioritize SWS if we are SURE it's a copier
        filtered = [...samsungSws, ...samsungSyncThru, ...filtered.filter(c => !c.path.startsWith('/sws'))];
      } else {
        // Unknown model or standard printer - SyncThru first to avoid locking up old firmware
        filtered = [...samsungSyncThru, ...samsungSws, ...filtered.filter(c => !c.path.startsWith('/sws'))];
      }
    }
    candidatesToTry = filtered;
  }

  for (const c of candidatesToTry) {
    try {
      const body = await fetchHttp(ip, c.path, c.protocol);
      if (!body) continue;
      const parsed = c.parse(body);

      // Merge: only overwrite with a better (non-null) value
      if (parsed.brand        != null) acc.brand        = parsed.brand;
      if (parsed.model        != null) acc.model        = parsed.model;
      if (parsed.serial       != null) acc.serial       = parsed.serial;
      if (parsed.mac          != null) acc.mac          = parsed.mac;
      if (parsed.hostname     != null) acc.hostname     = parsed.hostname;
      if (parsed.location     != null) acc.location     = parsed.location;
      if (parsed.totalPages   != null) acc.totalPages   = parsed.totalPages;
      if (parsed.monoPages    != null) acc.monoPages    = parsed.monoPages;
      if (parsed.colorPages   != null) acc.colorPages   = parsed.colorPages;
      if (parsed.tonerBlack   != null) acc.tonerBlack   = parsed.tonerBlack;
      if (parsed.tonerCyan    != null) acc.tonerCyan    = parsed.tonerCyan;
      if (parsed.tonerMagenta != null) acc.tonerMagenta = parsed.tonerMagenta;
      if (parsed.tonerYellow  != null) acc.tonerYellow  = parsed.tonerYellow;
      if (parsed.firmware     != null) acc.firmware     = parsed.firmware;
      // Cartridge identity — never overwrite a real value with null
      if (parsed.cartridgeCodeBlack      != null) acc.cartridgeCodeBlack      = parsed.cartridgeCodeBlack;
      if (parsed.cartridgeCodeCyan       != null) acc.cartridgeCodeCyan       = parsed.cartridgeCodeCyan;
      if (parsed.cartridgeCodeMagenta    != null) acc.cartridgeCodeMagenta    = parsed.cartridgeCodeMagenta;
      if (parsed.cartridgeCodeYellow     != null) acc.cartridgeCodeYellow     = parsed.cartridgeCodeYellow;
      if (parsed.cartridgeSerialBlack    != null) acc.cartridgeSerialBlack    = parsed.cartridgeSerialBlack;
      if (parsed.cartridgeSerialCyan     != null) acc.cartridgeSerialCyan     = parsed.cartridgeSerialCyan;
      if (parsed.cartridgeSerialMagenta  != null) acc.cartridgeSerialMagenta  = parsed.cartridgeSerialMagenta;
      if (parsed.cartridgeSerialYellow   != null) acc.cartridgeSerialYellow   = parsed.cartridgeSerialYellow;
      if (parsed.cartridgeCapacityBlack  != null) acc.cartridgeCapacityBlack  = parsed.cartridgeCapacityBlack;
      if (parsed.cartridgeCapacityCyan   != null) acc.cartridgeCapacityCyan   = parsed.cartridgeCapacityCyan;
      if (parsed.cartridgeCapacityMagenta != null) acc.cartridgeCapacityMagenta = parsed.cartridgeCapacityMagenta;
      if (parsed.cartridgeCapacityYellow != null) acc.cartridgeCapacityYellow = parsed.cartridgeCapacityYellow;
      if (parsed.cartridgePrintedBlack   != null) acc.cartridgePrintedBlack   = parsed.cartridgePrintedBlack;
      if (parsed.cartridgePrintedCyan    != null) acc.cartridgePrintedCyan    = parsed.cartridgePrintedCyan;
      if (parsed.cartridgePrintedMagenta != null) acc.cartridgePrintedMagenta = parsed.cartridgePrintedMagenta;
      if (parsed.cartridgePrintedYellow  != null) acc.cartridgePrintedYellow  = parsed.cartridgePrintedYellow;
      if (parsed.cartridgeEstimatedBlack   != null) acc.cartridgeEstimatedBlack   = parsed.cartridgeEstimatedBlack;
      if (parsed.cartridgeEstimatedCyan    != null) acc.cartridgeEstimatedCyan    = parsed.cartridgeEstimatedCyan;
      if (parsed.cartridgeEstimatedMagenta != null) acc.cartridgeEstimatedMagenta = parsed.cartridgeEstimatedMagenta;
      if (parsed.cartridgeEstimatedYellow  != null) acc.cartridgeEstimatedYellow  = parsed.cartridgeEstimatedYellow;
      if (parsed.suppliesDetails           != null) acc.suppliesDetails           = parsed.suppliesDetails;

      // Stop as soon as we have totalPages, toner levels, and firmware (or completed candidates)
      if (identityOnly) {
        if (acc.model != null || acc.serial != null) break;
      } else {
        if (acc.totalPages != null && acc.tonerBlack != null && acc.firmware != null) break;
      }
    } catch { /* try next */ }
  }

  if (acc.totalPages === undefined && acc.model === undefined) return null;

  const brand = acc.brand ?? (acc.model ? detectBrandFromText(acc.model) : 'generic');
  return {
    brand,
    model:        acc.model        ?? null,
    serial:       acc.serial       ?? null,
    mac:          acc.mac          ?? null,
    hostname:     acc.hostname     ?? null,
    location:     acc.location     ?? null,
    totalPages:   acc.totalPages   ?? null,
    monoPages:    acc.monoPages    ?? null,
    colorPages:   acc.colorPages   ?? null,
    tonerBlack:   acc.tonerBlack   ?? null,
    tonerCyan:    acc.tonerCyan    ?? null,
    tonerMagenta: acc.tonerMagenta ?? null,
    tonerYellow:  acc.tonerYellow  ?? null,
    firmware:     acc.firmware     ?? null,
    cartridgeCodeBlack:       acc.cartridgeCodeBlack       ?? null,
    cartridgeCodeCyan:        acc.cartridgeCodeCyan        ?? null,
    cartridgeCodeMagenta:     acc.cartridgeCodeMagenta     ?? null,
    cartridgeCodeYellow:      acc.cartridgeCodeYellow      ?? null,
    cartridgeSerialBlack:     acc.cartridgeSerialBlack     ?? null,
    cartridgeSerialCyan:      acc.cartridgeSerialCyan      ?? null,
    cartridgeSerialMagenta:   acc.cartridgeSerialMagenta   ?? null,
    cartridgeSerialYellow:    acc.cartridgeSerialYellow    ?? null,
    cartridgeCapacityBlack:   acc.cartridgeCapacityBlack   ?? null,
    cartridgeCapacityCyan:    acc.cartridgeCapacityCyan    ?? null,
    cartridgeCapacityMagenta: acc.cartridgeCapacityMagenta ?? null,
    cartridgeCapacityYellow:  acc.cartridgeCapacityYellow  ?? null,
    cartridgePrintedBlack:    acc.cartridgePrintedBlack    ?? null,
    cartridgePrintedCyan:     acc.cartridgePrintedCyan     ?? null,
    cartridgePrintedMagenta:  acc.cartridgePrintedMagenta  ?? null,
    cartridgePrintedYellow:   acc.cartridgePrintedYellow   ?? null,
    cartridgeEstimatedBlack:    acc.cartridgeEstimatedBlack    ?? null,
    cartridgeEstimatedCyan:     acc.cartridgeEstimatedCyan     ?? null,
    cartridgeEstimatedMagenta:  acc.cartridgeEstimatedMagenta  ?? null,
    cartridgeEstimatedYellow:   acc.cartridgeEstimatedYellow   ?? null,
    suppliesDetails:            acc.suppliesDetails            ?? null,
  };
}

// ─── Targeted scans: meters-only and supplies-only ───────────────────────────
// Used by the dedicated meterLoop and suppliesLoop in main.ts.
// Skip identity-only candidates (no produces tag) and brand-filter as usual.

function buildTargetedCandidates(targetBrand: Brand | undefined, produces: 'meters' | 'supplies'): EwsCandidate[] {
  let list = CANDIDATES.filter(c => c.produces === produces);
  if (targetBrand && targetBrand !== 'generic') {
    list = list.filter(c => c.brand === targetBrand || !c.brand);
  }
  return list;
}

async function runTargetedEwsScan(
  ip: string,
  candidatesToTry: EwsCandidate[],
  stopWhen: (acc: Partial<EwsData>) => boolean,
): Promise<Partial<EwsData>> {
  const acc: Partial<EwsData> = {};
  for (const c of candidatesToTry) {
    try {
      const body = await fetchHttp(ip, c.path, c.protocol);
      if (!body) continue;
      const parsed = c.parse(body);
      if (parsed.brand        !== undefined) acc.brand        = parsed.brand;
      if (parsed.model        !== undefined) acc.model        = parsed.model;
      if (parsed.serial       !== undefined) acc.serial       = parsed.serial;
      if (parsed.totalPages   !== undefined) acc.totalPages   = parsed.totalPages;
      if (parsed.monoPages    !== undefined) acc.monoPages    = parsed.monoPages;
      if (parsed.colorPages   !== undefined) acc.colorPages   = parsed.colorPages;
      if (parsed.tonerBlack   !== undefined) acc.tonerBlack   = parsed.tonerBlack;
      if (parsed.tonerCyan    !== undefined) acc.tonerCyan    = parsed.tonerCyan;
      if (parsed.tonerMagenta !== undefined) acc.tonerMagenta = parsed.tonerMagenta;
      if (parsed.tonerYellow  !== undefined) acc.tonerYellow  = parsed.tonerYellow;
      if (parsed.cartridgeCodeBlack      != null) acc.cartridgeCodeBlack      = parsed.cartridgeCodeBlack;
      if (parsed.cartridgeCodeCyan       != null) acc.cartridgeCodeCyan       = parsed.cartridgeCodeCyan;
      if (parsed.cartridgeCodeMagenta    != null) acc.cartridgeCodeMagenta    = parsed.cartridgeCodeMagenta;
      if (parsed.cartridgeCodeYellow     != null) acc.cartridgeCodeYellow     = parsed.cartridgeCodeYellow;
      if (parsed.cartridgeSerialBlack    != null) acc.cartridgeSerialBlack    = parsed.cartridgeSerialBlack;
      if (parsed.cartridgeSerialCyan     != null) acc.cartridgeSerialCyan     = parsed.cartridgeSerialCyan;
      if (parsed.cartridgeSerialMagenta  != null) acc.cartridgeSerialMagenta  = parsed.cartridgeSerialMagenta;
      if (parsed.cartridgeSerialYellow   != null) acc.cartridgeSerialYellow   = parsed.cartridgeSerialYellow;
      if (parsed.cartridgeCapacityBlack  != null) acc.cartridgeCapacityBlack  = parsed.cartridgeCapacityBlack;
      if (parsed.cartridgeCapacityCyan   != null) acc.cartridgeCapacityCyan   = parsed.cartridgeCapacityCyan;
      if (parsed.cartridgeCapacityMagenta != null) acc.cartridgeCapacityMagenta = parsed.cartridgeCapacityMagenta;
      if (parsed.cartridgeCapacityYellow != null) acc.cartridgeCapacityYellow = parsed.cartridgeCapacityYellow;
      if (parsed.cartridgePrintedBlack   != null) acc.cartridgePrintedBlack   = parsed.cartridgePrintedBlack;
      if (parsed.cartridgePrintedCyan    != null) acc.cartridgePrintedCyan    = parsed.cartridgePrintedCyan;
      if (parsed.cartridgePrintedMagenta != null) acc.cartridgePrintedMagenta = parsed.cartridgePrintedMagenta;
      if (parsed.cartridgePrintedYellow  != null) acc.cartridgePrintedYellow  = parsed.cartridgePrintedYellow;
      if (parsed.cartridgeEstimatedBlack   != null) acc.cartridgeEstimatedBlack   = parsed.cartridgeEstimatedBlack;
      if (parsed.cartridgeEstimatedCyan    != null) acc.cartridgeEstimatedCyan    = parsed.cartridgeEstimatedCyan;
      if (parsed.cartridgeEstimatedMagenta != null) acc.cartridgeEstimatedMagenta = parsed.cartridgeEstimatedMagenta;
      if (parsed.cartridgeEstimatedYellow  != null) acc.cartridgeEstimatedYellow  = parsed.cartridgeEstimatedYellow;
      if (stopWhen(acc)) break;
    } catch { /* try next */ }
  }
  return acc;
}

export async function readDeviceCountersViaEWS(ip: string, targetBrand?: Brand): Promise<EwsData | null> {
  const candidates = buildTargetedCandidates(targetBrand, 'meters');
  if (candidates.length === 0) return null;
  const acc = await runTargetedEwsScan(ip, candidates, a => a.totalPages !== undefined);
  if (acc.totalPages === undefined) return null;
  const brand = acc.brand ?? (acc.model ? detectBrandFromText(acc.model) : targetBrand ?? 'generic');
  return {
    brand, model: acc.model ?? null, serial: acc.serial ?? null,
    totalPages: acc.totalPages ?? null, monoPages: acc.monoPages ?? null, colorPages: acc.colorPages ?? null,
    tonerBlack: null, tonerCyan: null, tonerMagenta: null, tonerYellow: null,
    cartridgeCodeBlack: null, cartridgeCodeCyan: null, cartridgeCodeMagenta: null, cartridgeCodeYellow: null,
    cartridgeSerialBlack: null, cartridgeSerialCyan: null, cartridgeSerialMagenta: null, cartridgeSerialYellow: null,
    cartridgeCapacityBlack: null, cartridgeCapacityCyan: null, cartridgeCapacityMagenta: null, cartridgeCapacityYellow: null,
    cartridgePrintedBlack: null, cartridgePrintedCyan: null, cartridgePrintedMagenta: null, cartridgePrintedYellow: null,
    cartridgeEstimatedBlack: null, cartridgeEstimatedCyan: null, cartridgeEstimatedMagenta: null, cartridgeEstimatedYellow: null,
  };
}

export async function readDeviceSuppliesViaEWS(ip: string, targetBrand?: Brand): Promise<EwsData | null> {
  const candidates = buildTargetedCandidates(targetBrand, 'supplies');
  if (candidates.length === 0) return null;
  const acc = await runTargetedEwsScan(ip, candidates, a => a.tonerBlack !== undefined);
  if (acc.tonerBlack === undefined && acc.tonerCyan === undefined &&
      acc.tonerMagenta === undefined && acc.tonerYellow === undefined) return null;
  const brand = acc.brand ?? (acc.model ? detectBrandFromText(acc.model) : targetBrand ?? 'generic');
  return {
    brand, model: acc.model ?? null, serial: acc.serial ?? null,
    totalPages: null, monoPages: null, colorPages: null,
    tonerBlack: acc.tonerBlack ?? null, tonerCyan: acc.tonerCyan ?? null,
    tonerMagenta: acc.tonerMagenta ?? null, tonerYellow: acc.tonerYellow ?? null,
    cartridgeCodeBlack: acc.cartridgeCodeBlack ?? null, cartridgeCodeCyan: acc.cartridgeCodeCyan ?? null,
    cartridgeCodeMagenta: acc.cartridgeCodeMagenta ?? null, cartridgeCodeYellow: acc.cartridgeCodeYellow ?? null,
    cartridgeSerialBlack: acc.cartridgeSerialBlack ?? null, cartridgeSerialCyan: acc.cartridgeSerialCyan ?? null,
    cartridgeSerialMagenta: acc.cartridgeSerialMagenta ?? null, cartridgeSerialYellow: acc.cartridgeSerialYellow ?? null,
    cartridgeCapacityBlack: acc.cartridgeCapacityBlack ?? null, cartridgeCapacityCyan: acc.cartridgeCapacityCyan ?? null,
    cartridgeCapacityMagenta: acc.cartridgeCapacityMagenta ?? null, cartridgeCapacityYellow: acc.cartridgeCapacityYellow ?? null,
    cartridgePrintedBlack: acc.cartridgePrintedBlack ?? null, cartridgePrintedCyan: acc.cartridgePrintedCyan ?? null,
    cartridgePrintedMagenta: acc.cartridgePrintedMagenta ?? null, cartridgePrintedYellow: acc.cartridgePrintedYellow ?? null,
    cartridgeEstimatedBlack: acc.cartridgeEstimatedBlack ?? null, cartridgeEstimatedCyan: acc.cartridgeEstimatedCyan ?? null,
    cartridgeEstimatedMagenta: acc.cartridgeEstimatedMagenta ?? null, cartridgeEstimatedYellow: acc.cartridgeEstimatedYellow ?? null,
  };
}

export function fetchHttp(
  ip: string,
  path: string,
  protocol: 'http' | 'https',
  redirectDepth = 0,
): Promise<string | null> {
  if (redirectDepth > 3) return Promise.resolve(null); // guard against redirect loops

  return new Promise((resolve) => {
    const lib  = protocol === 'https' ? https : http;
    const port = protocol === 'https' ? 443   : 80;
    const req  = lib.request(
      {
        hostname: ip,
        port,
        path,
        method: 'GET',
        timeout: EWS_TIMEOUT,
        rejectUnauthorized: false,
        headers: {
          'Accept-Encoding': 'gzip, deflate, identity',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) STC-Cloud-Agent/1.0',
        },
      },
      (res) => {
        // Handle redirects (301, 302, 307, 308)
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          let loc = res.headers.location;
          let nextProtocol = protocol;
          let nextPath = path;

          if (loc.startsWith('https://')) {
            nextProtocol = 'https';
            const urlWithoutProto = loc.slice(8);
            const firstSlash = urlWithoutProto.indexOf('/');
            nextPath = firstSlash !== -1 ? urlWithoutProto.slice(firstSlash) : '/';
          } else if (loc.startsWith('http://')) {
            nextProtocol = 'http';
            const urlWithoutProto = loc.slice(7);
            const firstSlash = urlWithoutProto.indexOf('/');
            nextPath = firstSlash !== -1 ? urlWithoutProto.slice(firstSlash) : '/';
          } else {
            nextPath = loc;
          }

          resolve(fetchHttp(ip, nextPath, nextProtocol, redirectDepth + 1));
          return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) { resolve(null); return; }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end',  () => {
          try {
            const buffer = Buffer.concat(chunks);
            const encoding = (res.headers['content-encoding'] || '').toLowerCase();
            let body: string;
            if (encoding.includes('gzip')) {
              body = zlib.gunzipSync(buffer).toString('utf8');
            } else if (encoding.includes('deflate')) {
              body = zlib.inflateSync(buffer).toString('utf8');
            } else {
              body = buffer.toString('utf8');
            }
            resolve(body);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}
