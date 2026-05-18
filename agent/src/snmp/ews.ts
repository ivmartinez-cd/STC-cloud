import http  from 'http';
import https from 'https';
import { detectBrandFromText, type Brand } from './oids';

const EWS_TIMEOUT = 4000;

export interface EwsData {
  brand:       Brand;
  model:       string | null;
  serial:      string | null;
  totalPages:  number | null;
  monoPages:   number | null;
  colorPages:  number | null;
}

// ─── URL candidates ordered by reliability ───────────────────────────────────

type Parser = (body: string) => Partial<EwsData>;

interface EwsCandidate { path: string; protocol: 'http' | 'https'; parse: Parser; }

const CANDIDATES: EwsCandidate[] = [
  // Samsung SyncThru: home (model + serial), identity (model + serial), then counters (page count)
  { path: '/sws/app/information/home/home.json',                   protocol: 'http',  parse: parseSamsungHome     },
  { path: '/sws/app/information/identity/identity.json',           protocol: 'http',  parse: parseSamsungIdentity },
  { path: '/sws/app/information/counters/counters.json',           protocol: 'http',  parse: parseSamsungCounters },
  // Lexmark config/deviceinfo
  { path: '/cgi-bin/dynamic/printer/config/reports/deviceinfo.html', protocol: 'http',  parse: parseLexmarkEws      },
  // HP: XML > HTML (XML is more stable across firmware updates)
  { path: '/DevMgmt/ProductUsageDyn.xml',                          protocol: 'http',  parse: parseHpXml   },
  { path: '/hp/device/InternalPages/Index?id=UsagePage',           protocol: 'http',  parse: parseHpHtml  },
  // Ricoh
  { path: '/web/entry.cgi?func=STR_PRTCNT',                        protocol: 'http',  parse: parseGeneric },
  // Brother
  { path: '/general/status.html',                                  protocol: 'http',  parse: parseGeneric },
  // Epson
  { path: '/PRESENTATION/HTML/TOP/PRTINFO.HTML',                   protocol: 'http',  parse: parseGeneric },
  // Canon
  { path: '/English/pages/cnc_status.html',                        protocol: 'http',  parse: parseGeneric },
  // Konica Minolta
  { path: '/wcd/index.html',                                        protocol: 'http',  parse: parseGeneric },
  // Xerox
  { path: '/cgi-bin/cgix/xerox/printerStat.cgi',                   protocol: 'http',  parse: parseGeneric },
];

export async function readDeviceViaEWS(ip: string): Promise<EwsData | null> {
  // Accumulates data across candidates so that model from one endpoint
  // can be combined with counters from another (e.g. Samsung identity + counters).
  let acc: Partial<EwsData> = {};

  for (const c of CANDIDATES) {
    try {
      const body = await fetchHttp(ip, c.path, c.protocol);
      if (!body) continue;
      const parsed = c.parse(body);

      // Merge: only overwrite with a better (non-undefined) value
      if (parsed.brand      !== undefined) acc.brand      = parsed.brand;
      if (parsed.model      !== undefined) acc.model      = parsed.model;
      if (parsed.serial     !== undefined) acc.serial     = parsed.serial;
      if (parsed.totalPages !== undefined) acc.totalPages = parsed.totalPages;
      if (parsed.monoPages  !== undefined) acc.monoPages  = parsed.monoPages;
      if (parsed.colorPages !== undefined) acc.colorPages = parsed.colorPages;

      // Stop as soon as we have page counters (no need to probe more endpoints)
      if (acc.totalPages !== undefined) break;
    } catch { /* try next */ }
  }

  if (acc.totalPages === undefined && acc.model === undefined) return null;

  const brand = acc.brand ?? (acc.model ? detectBrandFromText(acc.model) : 'generic');
  return {
    brand,
    model:      acc.model      ?? null,
    serial:     acc.serial     ?? null,
    totalPages: acc.totalPages ?? null,
    monoPages:  acc.monoPages  ?? null,
    colorPages: acc.colorPages ?? null,
  };
}

// ─── Samsung JSON parsers ─────────────────────────────────────────────────────

// home.json — model name + serial (SyncThru V5/V6)
function parseSamsungHome(body: string): Partial<EwsData> {
  const modelMatch =
    body.match(/"?model_name"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?productName"?\s*:\s*"([^"]+)"/i);

  const serialMatch =
    body.match(/"?serial_num"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?serialNumber"?\s*:\s*"([^"]+)"/i);

  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;

  if (!model && !serial) return {};
  return { brand: 'samsung', model, serial };
}

// identity.json — model name + serial (SyncThru V4/V6)
function parseSamsungIdentity(body: string): Partial<EwsData> {
  // SyncThru V6 JSON format: {"identity":{"productName":"SL-M4580FX","serialNumber":"Z7K3..."}}
  // SyncThru V4 JS format:   GXI_SYS_PRD_NAME : 'SL-M4580FX'
  const modelMatch =
    body.match(/"?productName"?\s*:\s*"([^"]+)"/i) ??
    body.match(/GXI_SYS_PRD_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/GXI_SYS_MODEL_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/"?modelName"?\s*:\s*"([^"]+)"/i);

  const serialMatch =
    body.match(/"?serialNumber"?\s*:\s*"([^"]+)"/i) ??
    body.match(/GXI_SYS_SERIAL_NUM\s*:\s*["']([^"']+)["']/i);

  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;

  if (!model && !serial) return {};
  return { brand: 'samsung', model, serial };
}

// counters.json — page count + serial (+ model when available in the same response)
function parseSamsungCounters(body: string): Partial<EwsData> {
  const serialMatch = body.match(/GXI_SYS_SERIAL_NUM\s*:\s*["']([^"']+)["']/i) ??
                      body.match(/"serialNum"\s*:\s*"([^"]+)"/i);
  const totalMatch  = body.match(/GXI_BILLING_TOTAL_IMP_CNT\s*:\s*(\d+)/i);
  const simplexMatch = body.match(/GXI_BILLING_SIMPLEX_BW_TOTAL_CNT\s*:\s*(\d+)/i);
  const modelMatch  =
    body.match(/GXI_SYS_PRD_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/GXI_SYS_MODEL_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/"productName"\s*:\s*"([^"]+)"/i);

  const serial = serialMatch ? serialMatch[1].trim() : undefined;
  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  let   total  = totalMatch  ? Number(totalMatch[1]) : null;
  if (total === null && simplexMatch) total = Number(simplexMatch[1]);

  return {
    brand:      'samsung',
    model,
    serial,
    totalPages: total !== null ? total    : undefined,
    monoPages:  total !== null ? total    : undefined,
    colorPages: total !== null ? 0        : undefined,
  };
}

// ─── Lexmark EWS parser ──────────────────────────────────────────────────────

function parseLexmarkEws(html: string): Partial<EwsData> {
  const pageMatch = html.match(/(?:C.mputo de p.g\.|Page Count|Total Pages)[^=]*=\s*(\d+)/i);
  const serialMatch = html.match(/(?:N.mero de serie|Serial Number|Serial\s*(?:Num)?)[^=]*=\s*([A-Za-z0-9\-]+)/i);
  const modelMatch = html.match(/<center><FONT[^>]*>([^<]+)<\/FONT><\/center>/i) ?? 
                     html.match(/<title>([^<]+)<\/title>/i);

  const total = pageMatch ? Number(pageMatch[1]) : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;
  const model = modelMatch ? modelMatch[1].trim() : undefined;

  return {
    brand:      'lexmark',
    model:      model,
    serial:     serial,
    totalPages: total ?? undefined,
    monoPages:  total ?? undefined,
    colorPages: 0,
  };
}

// ─── HP XML parser (ProductUsageDyn.xml) ─────────────────────────────────────

function parseHpXml(xml: string): Partial<EwsData> {
  const v = (tag: string) => xmlVal(xml, tag);

  const total = v('TotalImpressions') ?? v('TotalPrinted')     ?? v('TotalEngineImpressions');
  const mono  = v('MonochromeImpressions') ?? v('MonochromePrinted');
  const color = v('ColorImpressions') ?? v('ColorPrinted');

  return {
    brand:      'hp',
    model:      v('ProductName') ?? v('ModelName') ?? null,
    serial:     v('SerialNumber') ?? null,
    totalPages: toInt(total),
    monoPages:  toInt(mono),
    colorPages: toInt(color),
  };
}

function xmlVal(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

// ─── HP HTML parser (UsagePage) ───────────────────────────────────────────────

function parseHpHtml(html: string): Partial<EwsData> {
  // Structured ID-based matching (Modern HP responsive / onehp theme)
  const serialMatch = html.match(/id="[^"]*(?:Device)?SerialNumber"[^>]*>\s*([^<\s]+)/i);
  const modelMatch  = html.match(/id="[^"]*ProductName"[^>]*>\s*([^<]+)/i);
  const totalMatch  = html.match(/id="[^"]*TotalTotal"[^>]*>\s*([\d\.,]+)/i) ??
                     html.match(/id="[^"]*Total\.Total"[^>]*>\s*([\d\.,]+)/i);

  const serial = serialMatch ? serialMatch[1].trim() : undefined;
  const model  = modelMatch ? modelMatch[1].trim() : undefined;
  let total: number | null = null;

  if (totalMatch) {
    total = parseInt(totalMatch[1].replace(/[,\.]/g, ''), 10);
  }

  const totalPages = total ?? 
    htmlCounter(html, /Total\s+Impressions/i) ?? 
    htmlCounter(html, /Total\s+Pages\s+Printed/i) ??
    htmlCounter(html, /Impresiones\s+totales/i) ??
    htmlCounter(html, /Total\s+general/i);

  return {
    brand:      'hp',
    model:      model ?? undefined,
    serial:     serial ?? undefined,
    totalPages: totalPages ?? undefined,
    monoPages:  totalPages ?? undefined,
    colorPages: 0,
  };
}

// ─── Generic parser (common counter label patterns) ──────────────────────────

function parseGeneric(html: string): Partial<EwsData> {
  const total = htmlCounter(html, /Total\s+(?:Pages|Impressions|Count|Print)/i)
    ?? htmlCounter(html, /TOTAL/i);
  const mono  = htmlCounter(html, /Mono(?:chrome)?\s+(?:Pages|Count|Total)/i)
    ?? htmlCounter(html, /Black\s+(?:Pages|Count)/i);
  const color = htmlCounter(html, /Color\s+(?:Pages|Count|Total)/i);

  const modelMatch = html.match(/(?:Model|Product)\s*(?:Name)?[\s:]+([A-Za-z0-9][A-Za-z0-9 \-]{3,50})/i);
  const serialMatch = html.match(/(?:Serial\s*(?:Number)?|S\/N)\s*:?\s*([A-Z0-9]{6,20})/i);

  return {
    model:      modelMatch  ? modelMatch[1].trim()  : undefined,
    serial:     serialMatch ? serialMatch[1].trim() : undefined,
    totalPages: total  ?? undefined,
    monoPages:  mono   ?? undefined,
    colorPages: color  ?? undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function htmlCounter(html: string, label: RegExp): number | null {
  const m = html.match(new RegExp(
    label.source + '[^<]{0,80}<[^>]+>[\\s]*(\\d[\\d,\\.]*)',
    'i',
  ));
  return m ? toInt(m[1]) : null;
}

function toInt(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = parseInt(v.replace(/[,\.]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function fetchHttp(
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
      { hostname: ip, port, path, method: 'GET', timeout: EWS_TIMEOUT, rejectUnauthorized: false },
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
        const parts: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (c: string) => parts.push(c));
        res.on('end',  () => resolve(parts.join('')));
      },
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}
