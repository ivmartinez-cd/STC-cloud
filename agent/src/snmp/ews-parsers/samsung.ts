import { type EwsData } from './types';

// home.json — model name + serial (SyncThru V5/V6)
export function parseSamsungHome(body: string): Partial<EwsData> {
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
export function parseSamsungIdentity(body: string): Partial<EwsData> {
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
export function parseSamsungCounters(body: string): Partial<EwsData> {
  const serialMatch = body.match(/GXI_SYS_SERIAL_NUM\s*:\s*["']([^"']+)["']/i) ??
                      body.match(/"serialNum"\s*:\s*"([^"]+)"/i);
  const totalMatch  = body.match(/GXI_BILLING_TOTAL_IMP_CNT\s*:\s*(\d+)/i);
  
  const simplexBwMatch = body.match(/GXI_BILLING_SIMPLEX_BW_TOTAL_CNT\s*:\s*(\d+)/i);
  const duplexBwMatch  = body.match(/GXI_BILLING_DUPLEX_BW_TOTAL_CNT\s*:\s*(\d+)/i);
  
  const simplexColorMatch = body.match(/GXI_BILLING_SIMPLEX_COLOR_TOTAL_CNT\s*:\s*(\d+)/i);
  const duplexColorMatch  = body.match(/GXI_BILLING_DUPLEX_COLOR_TOTAL_CNT\s*:\s*(\d+)/i);

  const modelMatch  =
    body.match(/GXI_SYS_PRD_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/GXI_SYS_MODEL_NAME\s*:\s*["']([^"']+)["']/i) ??
    body.match(/"productName"\s*:\s*"([^"]+)"/i);

  const serial = serialMatch ? serialMatch[1].trim() : undefined;
  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  
  const simplexBw = simplexBwMatch ? Number(simplexBwMatch[1]) : null;
  const duplexBw  = duplexBwMatch  ? Number(duplexBwMatch[1])  : null;
  const simplexColor = simplexColorMatch ? Number(simplexColorMatch[1]) : null;
  const duplexColor  = duplexColorMatch  ? Number(duplexColorMatch[1])  : null;

  let total = totalMatch ? Number(totalMatch[1]) : null;

  let mono: number | undefined = undefined;
  let color: number | undefined = undefined;

  if (simplexBw !== null || duplexBw !== null) {
    mono = (simplexBw ?? 0) + (duplexBw ?? 0);
  }
  if (simplexColor !== null || duplexColor !== null) {
    color = (simplexColor ?? 0) + (duplexColor ?? 0);
  }

  // If mono was parsed but color was not, default color to 0
  if (mono !== undefined && color === undefined) {
    color = 0;
  }

  if (total === null && mono !== undefined) {
    total = mono + (color ?? 0);
  }

  // Fallback: if we couldn't parse mono or color, use total as mono
  if (total !== null && mono === undefined) {
    mono = total;
    color = 0;
  }

  return {
    brand:      'samsung',
    model,
    serial,
    totalPages: total !== null ? total : undefined,
    monoPages:  mono !== undefined ? mono : undefined,
    colorPages: color !== undefined ? color : undefined,
  };
}

// Samsung Solution Web Service — home info (model + serial + toner levels)
export function parseSamsungSolutionHome(body: string): Partial<EwsData> {
  const modelMatch = body.match(/(?:모델명|Model\s*Name)<\/td>\s*<td class="[^"]*">([^<]+)<\/td>/i);
  const serialMatch = body.match(/(?:시리얼\s*넘버|Serial\s*Number)<\/td>\s*<td class="[^"]*">([^<]+)<\/td>/i);

  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;

  // Extract toner levels from embedded JavaScript: var tonerData = [ {cartridge:'검정색', remaining:'90', ...}, ... ];
  let tonerBlack:   number | undefined = undefined;
  let tonerCyan:    number | undefined = undefined;
  let tonerMagenta: number | undefined = undefined;
  let tonerYellow:  number | undefined = undefined;

  const tonerDataMatch = body.match(/var\s+tonerData\s*=\s*\[([\s\S]*?)\];/);
  if (tonerDataMatch) {
    const block = tonerDataMatch[1];
    // Parse each {cartridge:'...', remaining:'N', ...} entry
    const entryRegex = /\{[^}]*cartridge\s*:\s*'([^']+)'[^}]*remaining\s*:\s*'(\d+)'/gi;
    let m;
    while ((m = entryRegex.exec(block)) !== null) {
      const label = m[1];
      const pct = Math.min(100, Math.max(0, parseInt(m[2], 10)));
      if (isNaN(pct)) continue;
      // Map Korean/English color names to toner slots
      if (/검정|black/i.test(label))       tonerBlack   = pct;
      else if (/시안|cyan/i.test(label))   tonerCyan    = pct;
      else if (/마젠타|magenta/i.test(label)) tonerMagenta = pct;
      else if (/노란|yellow/i.test(label)) tonerYellow  = pct;
    }
  }

  if (!model && !serial && tonerBlack === undefined) return {};
  return {
    brand: 'samsung', model, serial,
    tonerBlack, tonerCyan, tonerMagenta, tonerYellow,
  };
}

// Samsung Solution Web Service — page counters
export function parseSamsungSolutionCounters(html: string): Partial<EwsData> {
  // Extract serial number
  const snMatch = html.match(/id='snValue'[^>]*>([^<]+)/i) ||
                  html.match(/id="snValue"[^>]*>([^<]+)/i);
  const serial = snMatch ? snMatch[1].trim() : undefined;

  // Extract all rows and cells
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  let monoPages: number | undefined = undefined;
  let colorPages: number | undefined = undefined;
  let totalPages: number | undefined = undefined;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const tds: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      const text = tdMatch[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
      tds.push(text);
    }
    
    if (tds.length < 2) continue;
    const label = tds[0];
    
    // Get the last column value as the total for this category
    const lastValStr = tds[tds.length - 1];
    const lastVal = parseInt(lastValStr.replace(/[,\.]/g, ''), 10);
    if (isNaN(lastVal)) continue;

    if (/(?:흑백\s*-\s*총합|Black\s*-\s*Total|Mono\s*-\s*Total)/i.test(label)) {
      if (monoPages === undefined) monoPages = lastVal;
    } else if (/(?:컬러\s*-\s*총합|Color\s*-\s*Total|컬러\s*총합|Color\s*Total)/i.test(label)) {
      if (colorPages === undefined) colorPages = lastVal;
    } else if (/(?:전체\s*면수|Total\s*Impressions|Total\s*Pages)/i.test(label)) {
      if (totalPages === undefined) totalPages = lastVal;
    }
  }

  // Fallback: Total = Mono + Color
  if (totalPages === undefined && monoPages !== undefined) {
    totalPages = monoPages + (colorPages ?? 0);
  }

  return {
    brand:      'samsung',
    serial,
    totalPages,
    monoPages,
    colorPages,
  };
}

// ─── Samsung SyncThru supplies.json parser ────────────────────────────────────

export function parseSamsungSyncThruSupplies(body: string): Partial<EwsData> {
  // Extract a named field from a toner_<color> block
  const extractBlock = (color: string): { remaining: number | null; id: string | null; serial: string | null; capa: number | null } => {
    const blockMatch = body.match(new RegExp(`toner_${color}\\s*:\\s*\\{([\\s\\S]*?)\\}`, 'i'));
    if (!blockMatch) return { remaining: null, id: null, serial: null, capa: null };
    const block = blockMatch[1];

    const optMatch = block.match(/opt\s*:\s*(\d+)/i);
    if (optMatch && parseInt(optMatch[1], 10) === 0) {
      return { remaining: null, id: null, serial: null, capa: null }; // not installed
    }

    const remMatch  = block.match(/remaining\s*:\s*(\d+)/i);
    const idMatch   = block.match(/id\s*:\s*"([^"]+)"/i);
    const serMatch  = block.match(/serial\s*:\s*"([^"]+)"/i);
    const capaMatch = block.match(/capa\s*:\s*(\d+)/i);

    const remVal  = remMatch  ? parseInt(remMatch[1], 10)  : null;
    const capaVal = capaMatch ? parseInt(capaMatch[1], 10) : null;
    return {
      remaining: remVal !== null && !isNaN(remVal) ? Math.min(100, Math.max(0, remVal)) : null,
      id:        idMatch  ? idMatch[1].trim()  || null : null,
      serial:    serMatch ? serMatch[1].trim() || null : null,
      capa:      capaVal !== null && !isNaN(capaVal) && capaVal > 0 ? capaVal : null,
    };
  };

  const extractLegacy = (pattern: RegExp): number | null => {
    const m = body.match(pattern);
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return isNaN(v) ? null : Math.min(100, Math.max(0, v));
  };

  const bk = extractBlock('black');
  const cy = extractBlock('cyan');
  const mg = extractBlock('magenta');
  const ye = extractBlock('yellow');

  // Fallback to legacy format for remaining % if block parsing failed
  const black   = bk.remaining ?? extractLegacy(/GXI_TONER_BLACK_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"black"[^}]*"remaining"\s*:\s*(\d+)/i);
  const cyan    = cy.remaining ?? extractLegacy(/GXI_TONER_CYAN_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"cyan"[^}]*"remaining"\s*:\s*(\d+)/i);
  const magenta = mg.remaining ?? extractLegacy(/GXI_TONER_MAGENTA_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"magenta"[^}]*"remaining"\s*:\s*(\d+)/i);
  const yellow  = ye.remaining ?? extractLegacy(/GXI_TONER_YELLOW_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"yellow"[^}]*"remaining"\s*:\s*(\d+)/i);

  if (black === null && cyan === null && magenta === null && yellow === null) return {};
  return {
    brand: 'samsung',
    tonerBlack: black, tonerCyan: cyan, tonerMagenta: magenta, tonerYellow: yellow,
    cartridgeCodeBlack:       bk.id,     cartridgeCodeCyan:       cy.id,
    cartridgeCodeMagenta:     mg.id,     cartridgeCodeYellow:     ye.id,
    cartridgeSerialBlack:     bk.serial, cartridgeSerialCyan:     cy.serial,
    cartridgeSerialMagenta:   mg.serial, cartridgeSerialYellow:   ye.serial,
    cartridgeCapacityBlack:   bk.capa,   cartridgeCapacityCyan:   cy.capa,
    cartridgeCapacityMagenta: mg.capa,   cartridgeCapacityYellow: ye.capa,
  };
}

// ─── Samsung Solution Web Service supplies parser ─────────────────────────────

export function parseSamsungSolutionSupplies(html: string): Partial<EwsData> {
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#\d+;/g, ' ');

  const lines = cleanText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let black: number | null = null;
  let cyan:  number | null = null;
  let magenta: number | null = null;
  let yellow: number | null = null;

  let currentColor: 'black' | 'cyan' | 'magenta' | 'yellow' | null = null;

  for (const line of lines) {
    // 1. Detect color context
    if (/(?:이미징|OPC|드럼|Drum|Unit)/i.test(line)) {
      currentColor = null;
    } else if (/(?:흑백|검정|Black|Negro)/i.test(line) && /(?:토너|Toner|Toner)/i.test(line)) {
      currentColor = 'black';
    } else if (/(?:시안|청색|Cyan)/i.test(line) && /(?:토너|Toner|Toner)/i.test(line)) {
      currentColor = 'cyan';
    } else if (/(?:마젠타|심홍색|Magenta)/i.test(line) && /(?:토너|Toner|Toner)/i.test(line)) {
      currentColor = 'magenta';
    } else if (/(?:노란색|노란|Yellow|Amarillo)/i.test(line) && /(?:토너|Toner|Toner)/i.test(line)) {
      currentColor = 'yellow';
    }

    // 2. Extract percentage
    const m = line.match(/^(\d+)\s*%/);
    if (m) {
      const val = parseInt(m[1], 10);
      if (currentColor === 'black' && black === null) black = val;
      else if (currentColor === 'cyan' && cyan === null) cyan = val;
      else if (currentColor === 'magenta' && magenta === null) magenta = val;
      else if (currentColor === 'yellow' && yellow === null) yellow = val;
    }
  }

  if (black === null && cyan === null && magenta === null && yellow === null) return {};
  return { brand: 'samsung', tonerBlack: black, tonerCyan: cyan, tonerMagenta: magenta, tonerYellow: yellow };
}
