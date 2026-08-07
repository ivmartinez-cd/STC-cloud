import { type EwsData } from './types';

// home.json — model name, serial, mac, hostname, trays, toners (SyncThru V5/V6)
export function parseSamsungHome(body: string): Partial<EwsData> {
  const modelMatch =
    body.match(/"?model_name"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?productName"?\s*:\s*"([^"]+)"/i);

  const serialMatch =
    body.match(/"?serial_num"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?serialNumber"?\s*:\s*"([^"]+)"/i);

  const macMatch =
    body.match(/"?mac_addr"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?macAddress"?\s*:\s*"([^"]+)"/i);

  const hostMatch =
    body.match(/"?host_name"?\s*:\s*"([^"]+)"/i) ??
    body.match(/"?hostName"?\s*:\s*"([^"]+)"/i);

  const locMatch =
    body.match(/"?location"?\s*:\s*"([^"]+)"/i);

  const tonerBkMatch = body.match(/"?toner_black"?\s*:\s*\{[^}]*"?remaining"?\s*:\s*(\d+)/i);

  const model    = modelMatch  ? modelMatch[1].trim()  : undefined;
  const serial   = serialMatch ? serialMatch[1].trim() : undefined;
  const mac      = macMatch    ? macMatch[1].trim()    : undefined;
  const hostname = hostMatch   ? hostMatch[1].trim()   : undefined;
  const location = locMatch    ? locMatch[1].trim()    : undefined;
  const tonerBlack = tonerBkMatch ? parseInt(tonerBkMatch[1], 10) : undefined;

  // Input Trays parsing from home.json
  const inputTrays: Array<{ name: string; paperType?: string; paperSize?: string; level?: number; capacity?: number; status?: string }> = [];
  const tray1Match = body.match(/tray1\s*:\s*\{([^}]+)\}/i);
  if (tray1Match) {
    const t1Block = tray1Match[1];
    const opt = t1Block.match(/opt\s*:\s*(\d+)/i);
    const capa = t1Block.match(/capa\s*:\s*(\d+)/i);
    if (!opt || parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'Tray 1 (Interna)', paperType: 'Plain', paperSize: 'A4 LEF', capacity: capa ? parseInt(capa[1], 10) : 250, level: 100, status: 'Ready' });
    }
  }

  const tray2Match = body.match(/tray2\s*:\s*\{([^}]+)\}/i);
  if (tray2Match) {
    const t2Block = tray2Match[1];
    const opt = t2Block.match(/opt\s*:\s*(\d+)/i);
    const capa = t2Block.match(/capa\s*:\s*(\d+)/i);
    if (opt && parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'Tray 2 (Opcional)', paperType: 'Plain', paperSize: 'A4 LEF', capacity: capa ? parseInt(capa[1], 10) : 520, level: 100, status: 'Ready' });
    }
  }

  const mpMatch = body.match(/mp\s*:\s*\{([^}]+)\}/i);
  if (mpMatch) {
    const mpBlock = mpMatch[1];
    const opt = mpBlock.match(/opt\s*:\s*(\d+)/i);
    const capa = mpBlock.match(/capa\s*:\s*(\d+)/i);
    if (!opt || parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'MP Tray (Bypass)', paperType: 'Plain', paperSize: 'A4 SEF', capacity: capa ? parseInt(capa[1], 10) : 50, level: 100, status: 'Ready' });
    }
  }

  const outputTrays: Array<{ name: string; capacity?: string; status?: string }> = [];
  const outMatch = body.match(/outputTray\s*:\s*\[\s*\[\s*(\d+)\s*,\s*(\d+)/i);
  if (outMatch) {
    outputTrays.push({ name: 'Standard Bin', capacity: `${outMatch[2]} hojas`, status: 'Ready' });
  }

  const suppliesDetails = (inputTrays.length > 0 || outputTrays.length > 0 || tonerBlack !== undefined) ? {
    toners: tonerBlack !== undefined ? { black: { percentage: tonerBlack, status: 'Ready' } } : undefined,
    inputTrays: inputTrays.length > 0 ? inputTrays : undefined,
    outputTrays: outputTrays.length > 0 ? outputTrays : undefined,
  } : undefined;

  if (!model && !serial && !mac) return {};
  return { brand: 'samsung', model, serial, mac, hostname, location, tonerBlack, suppliesDetails };
}

// activealert.json — active alerts extraction for SyncThru
export function parseSamsungActiveAlert(body: string): Partial<EwsData> {
  const alerts: Array<{ code?: string; description?: string; severity?: string; time?: string }> = [];

  const recordMatches = body.matchAll(/\{\s*severity\s*:\s*(\d+)\s*,\s*code\s*:\s*"([^"]*)"\s*,\s*desc\s*:\s*"([^"]*)"/gi);
  for (const m of recordMatches) {
    const sevNum = parseInt(m[1], 10);
    const code = m[2].trim();
    const desc = m[3].trim();
    let severity = 'INFO';
    if (sevNum === 2 || sevNum === 3) severity = 'WARNING';
    if (sevNum >= 4) severity = 'ERROR';
    alerts.push({ code, description: desc, severity, time: new Date().toISOString() });
  }

  if (alerts.length === 0) {
    const descMatch = body.match(/desc\s*:\s*"([^"]+)"/i);
    const codeMatch = body.match(/code\s*:\s*"([^"]+)"/i);
    const sevMatch  = body.match(/severity\s*:\s*(\d+)/i);
    if (descMatch) {
      const sevNum = sevMatch ? parseInt(sevMatch[1], 10) : 1;
      let severity = 'INFO';
      if (sevNum === 2 || sevNum === 3) severity = 'WARNING';
      if (sevNum >= 4) severity = 'ERROR';
      alerts.push({
        code: codeMatch ? codeMatch[1] : undefined,
        description: descMatch[1],
        severity,
        time: new Date().toISOString(),
      });
    }
  }

  if (alerts.length === 0) return {};

  return {
    brand: 'samsung',
    suppliesDetails: {
      alerts,
    },
  };
}

// fwupgrade.json — Samsung Firmware Version (SyncThru V5/V6)
export function parseSamsungFwUpgrade(body: string): Partial<EwsData> {
  const mainFwMatch =
    body.match(/id\s*:\s*["']GXI_FW_MAIN_VER["']\s*,\s*version\s*:\s*["']([^"']+)["']/i) ??
    body.match(/name\s*:\s*["']Main Firmware["']\s*,[\s\S]*?version\s*:\s*["']([^"']+)["']/i) ??
    body.match(/"?version"?\s*:\s*"([^"]+)"/i);

  if (!mainFwMatch) return {};

  const firmware = mainFwMatch[1].trim();
  return { brand: 'samsung', firmware };
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

  const matchVal = (key: string): number => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*["']?(\\d+)["']?`, 'i'));
    return m ? parseInt(m[1], 10) : 0;
  };

  const monoSimplexPrint  = matchVal('GXI_BILLING_SIMPLEX_BW_PRINT_CNT');
  const monoSimplexReport = matchVal('GXI_BILLING_SIMPLEX_BW_REPORT_CNT');
  const monoSimplexTotal  = matchVal('GXI_BILLING_SIMPLEX_BW_TOTAL_CNT') || (monoSimplexPrint + monoSimplexReport);

  const duplexPrint  = matchVal('GXI_BILLING_DUPLEX_BW_PRINT_CNT');
  const duplexReport = matchVal('GXI_BILLING_DUPLEX_BW_REPORT_CNT');
  const duplexTotal  = matchVal('GXI_BILLING_DUPLEX_BW_TOTAL_CNT') || (duplexPrint + duplexReport);

  const totalPrint       = matchVal('GXI_BILLING_TOTAL_PRINT_CNT') || (monoSimplexPrint + duplexPrint);
  const totalReport      = matchVal('GXI_BILLING_TOTAL_REPORT_CNT') || (monoSimplexReport + duplexReport);
  const totalImpressions = matchVal('GXI_BILLING_TOTAL_IMP_CNT') || (totalPrint + totalReport);

  return {
    brand:      'samsung',
    model,
    serial,
    totalPages: total !== null ? total : undefined,
    monoPages:  mono !== undefined ? mono : undefined,
    colorPages: color !== undefined ? color : undefined,
    suppliesDetails: {
      counters: {
        monoSimplex: { print: monoSimplexPrint, report: monoSimplexReport, total: monoSimplexTotal },
        duplex: { print: duplexPrint, report: duplexReport, total: duplexTotal },
        totalImpressions: { print: totalPrint, report: totalReport, total: totalImpressions }
      }
    }
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

// ─── Samsung SyncThru supplies.json parser ────────────────────────────────────

export function parseSamsungSyncThruSupplies(body: string): Partial<EwsData> {
  // Extract a named field from a toner_<color> or drum_<color> block
  const extractBlock = (prefix: string, color: string): { remaining: number | null; id: string | null; serial: string | null; capa: number | null; status: string | null } => {
    const blockMatch = body.match(new RegExp(`${prefix}_${color}\\s*:\\s*\\{([\\s\\S]*?)\\}`, 'i'));
    if (!blockMatch) return { remaining: null, id: null, serial: null, capa: null, status: null };
    const block = blockMatch[1];

    const optMatch = block.match(/opt\s*:\s*(\d+)/i);
    if (optMatch && parseInt(optMatch[1], 10) === 0) {
      return { remaining: null, id: null, serial: null, capa: null, status: null }; // not installed
    }

    const remMatch   = block.match(/remaining\s*:\s*(\d+)/i);
    const idMatch    = block.match(/id\s*:\s*"([^"]+)"/i);
    const serMatch   = block.match(/serial\s*:\s*"([^"]+)"/i);
    const capaMatch  = block.match(/capa\s*:\s*(\d+)/i);
    const statMatch  = block.match(/status\s*:\s*"([^"]+)"/i);

    const remVal  = remMatch  ? parseInt(remMatch[1], 10)  : null;
    const capaVal = capaMatch ? parseInt(capaMatch[1], 10) : null;
    return {
      remaining: remVal !== null && !isNaN(remVal) ? Math.min(100, Math.max(0, remVal)) : null,
      id:        idMatch   ? idMatch[1].trim()   || null : null,
      serial:    serMatch  ? serMatch[1].trim()  || null : null,
      capa:      capaVal !== null && !isNaN(capaVal) && capaVal > 0 ? capaVal : null,
      status:    statMatch ? statMatch[1].trim() || 'Ready' : 'Ready',
    };
  };

  const extractLegacy = (pattern: RegExp): number | null => {
    const m = body.match(pattern);
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return isNaN(v) ? null : Math.min(100, Math.max(0, v));
  };

  const bk = extractBlock('toner', 'black');
  const cy = extractBlock('toner', 'cyan');
  const mg = extractBlock('toner', 'magenta');
  const ye = extractBlock('toner', 'yellow');

  // Drums / Imaging units
  const drumBk = extractBlock('drum', 'black');
  const drumCy = extractBlock('drum', 'cyan');
  const drumMg = extractBlock('drum', 'magenta');
  const drumYe = extractBlock('drum', 'yellow');

  // Fallback to legacy format for remaining % if block parsing failed
  const black   = bk.remaining ?? extractLegacy(/GXI_TONER_BLACK_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"black"[^}]*"remaining"\s*:\s*(\d+)/i);
  const cyan    = cy.remaining ?? extractLegacy(/GXI_TONER_CYAN_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"cyan"[^}]*"remaining"\s*:\s*(\d+)/i);
  const magenta = mg.remaining ?? extractLegacy(/GXI_TONER_MAGENTA_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"magenta"[^}]*"remaining"\s*:\s*(\d+)/i);
  const yellow  = ye.remaining ?? extractLegacy(/GXI_TONER_YELLOW_REMAIN_CNT\s*:\s*(\d+)/i)
               ?? extractLegacy(/"color"\s*:\s*"yellow"[^}]*"remaining"\s*:\s*(\d+)/i);

  // Drums fallback
  const drumBkPct = drumBk.remaining ?? extractLegacy(/GXI_DRUM_BLACK_REMAIN_CNT\s*:\s*(\d+)/i);
  const drumCyPct = drumCy.remaining ?? extractLegacy(/GXI_DRUM_CYAN_REMAIN_CNT\s*:\s*(\d+)/i);
  const drumMgPct = drumMg.remaining ?? extractLegacy(/GXI_DRUM_MAGENTA_REMAIN_CNT\s*:\s*(\d+)/i);
  const drumYePct = drumYe.remaining ?? extractLegacy(/GXI_DRUM_YELLOW_REMAIN_CNT\s*:\s*(\d+)/i);

  // Fuser & Transfer Belt & Waste Toner
  const fuserMatch    = body.match(/fuser_kit\s*:\s*(\d+)/i);
  const fuserMaxMatch = body.match(/fuser_kit_max\s*:\s*(\d+)/i);
  let fuserPct = extractLegacy(/GXI_FUSER_REMAIN_CNT\s*:\s*(\d+)/i);
  if (fuserPct === null && fuserMatch && fuserMaxMatch) {
    const used = parseInt(fuserMatch[1], 10);
    const max  = parseInt(fuserMaxMatch[1], 10);
    if (max > 0) fuserPct = Math.min(100, Math.max(0, Math.round((1 - used / max) * 100)));
  }

  const btrMatch    = body.match(/btr_kit\s*:\s*(\d+)/i);
  const btrMaxMatch = body.match(/btr_kit_max\s*:\s*(\d+)/i);
  let beltPct = extractLegacy(/GXI_TRANSFER_BELT_REMAIN_CNT\s*:\s*(\d+)/i);
  if (beltPct === null && btrMatch && btrMaxMatch) {
    const used = parseInt(btrMatch[1], 10);
    const max  = parseInt(btrMaxMatch[1], 10);
    if (max > 0) beltPct = Math.min(100, Math.max(0, Math.round((1 - used / max) * 100)));
  }

  const calcPct = (currKey: string, maxKey: string, text: string): number | null => {
    const currM = text.match(new RegExp(`${currKey}\\s*:\\s*(\\d+)`, 'i'));
    const maxM  = text.match(new RegExp(`${maxKey}\\s*:\\s*(\\d+)`, 'i'));
    if (!currM || !maxM) return null;
    const curr = parseInt(currM[1], 10);
    const max  = parseInt(maxM[1], 10);
    if (max <= 0) return null;
    return Math.min(100, Math.max(0, Math.round((1 - curr / max) * 100)));
  };

  const tray1RollerPct       = calcPct('roller_tray1', 'roller_tray1_max', body);
  const tray1RetardRollerPct = calcPct('torque_limiter_tray1', 'torque_limiter_tray1_max', body);
  const mpTrayRollerPct       = calcPct('roller_bypass', 'roller_bypass_max', body);
  const mpTrayRetardRollerPct = calcPct('retard_roller_mp', 'retard_roller_mp_max', body);

  // Input Trays parsing from home.json / supplies.json
  const inputTrays: Array<{ name: string; paperType?: string; paperSize?: string; level?: number; capacity?: number; status?: string }> = [];
  const tray1Match = body.match(/tray1\s*:\s*\{([^}]+)\}/i);
  if (tray1Match) {
    const t1Block = tray1Match[1];
    const opt = t1Block.match(/opt\s*:\s*(\d+)/i);
    const capa = t1Block.match(/capa\s*:\s*(\d+)/i);
    if (!opt || parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'Tray 1 (Interna)', paperType: 'Plain', paperSize: 'A4 LEF', capacity: capa ? parseInt(capa[1], 10) : 250, level: 100, status: 'Ready' });
    }
  }

  const tray2Match = body.match(/tray2\s*:\s*\{([^}]+)\}/i);
  if (tray2Match) {
    const t2Block = tray2Match[1];
    const opt = t2Block.match(/opt\s*:\s*(\d+)/i);
    const capa = t2Block.match(/capa\s*:\s*(\d+)/i);
    if (opt && parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'Tray 2 (Opcional)', paperType: 'Plain', paperSize: 'A4 LEF', capacity: capa ? parseInt(capa[1], 10) : 520, level: 100, status: 'Ready' });
    }
  }

  const mpMatch = body.match(/mp\s*:\s*\{([^}]+)\}/i);
  if (mpMatch) {
    const mpBlock = mpMatch[1];
    const opt = mpBlock.match(/opt\s*:\s*(\d+)/i);
    const capa = mpBlock.match(/capa\s*:\s*(\d+)/i);
    if (!opt || parseInt(opt[1], 10) > 0) {
      inputTrays.push({ name: 'MP Tray (Bypass)', paperType: 'Plain', paperSize: 'A4 SEF', capacity: capa ? parseInt(capa[1], 10) : 50, level: 100, status: 'Ready' });
    }
  }

  // Output Bins parsing
  const outputTrays: Array<{ name: string; capacity?: string; status?: string }> = [];
  const outMatch = body.match(/outputTray\s*:\s*\[\s*\[\s*(\d+)\s*,\s*(\d+)/i);
  if (outMatch) {
    outputTrays.push({ name: 'Standard Bin', capacity: `${outMatch[2]} hojas`, status: 'Ready' });
  }

  const suppliesDetails = {
    toners: {
      black:   bk.remaining !== null || black !== null ? { percentage: bk.remaining ?? black, status: bk.status, code: bk.id, serial: bk.serial, capacity: bk.capa } : undefined,
      cyan:    cy.remaining !== null || cyan !== null ? { percentage: cy.remaining ?? cyan, status: cy.status, code: cy.id, serial: cy.serial, capacity: cy.capa } : undefined,
      magenta: mg.remaining !== null || magenta !== null ? { percentage: mg.remaining ?? magenta, status: mg.status, code: mg.id, serial: mg.serial, capacity: mg.capa } : undefined,
      yellow:  ye.remaining !== null || yellow !== null ? { percentage: ye.remaining ?? yellow, status: ye.status, code: ye.id, serial: ye.serial, capacity: ye.capa } : undefined,
    },
    drums: (drumBkPct !== null || drumCyPct !== null || drumMgPct !== null || drumYePct !== null) ? {
      black:   drumBkPct !== null ? { percentage: drumBkPct, status: drumBk.status || 'Ready', serial: drumBk.serial } : undefined,
      cyan:    drumCyPct !== null ? { percentage: drumCyPct, status: drumCy.status || 'Ready', serial: drumCy.serial } : undefined,
      magenta: drumMgPct !== null ? { percentage: drumMgPct, status: drumMg.status || 'Ready', serial: drumMg.serial } : undefined,
      yellow:  drumYePct !== null ? { percentage: drumYePct, status: drumYe.status || 'Ready', serial: drumYe.serial } : undefined,
    } : undefined,
    maintenance: (fuserPct !== null || beltPct !== null || tray1RollerPct !== null || tray1RetardRollerPct !== null || mpTrayRollerPct !== null || mpTrayRetardRollerPct !== null) ? {
      fuser: fuserPct !== null ? { percentage: fuserPct, status: 'Ready' } : undefined,
      transferBelt: (beltPct !== null && (cyan !== null || magenta !== null || yellow !== null || cy.remaining != null || mg.remaining != null || ye.remaining != null)) ? { percentage: beltPct, status: 'Ready' } : undefined,
      transferRoller: (beltPct !== null && cyan === null && magenta === null && yellow === null && cy.remaining == null && mg.remaining == null && ye.remaining == null) ? { percentage: beltPct, status: 'Ready' } : undefined,
      tray1Roller: tray1RollerPct !== null ? { percentage: tray1RollerPct, status: 'Ready' } : undefined,
      tray1RetardRoller: tray1RetardRollerPct !== null ? { percentage: tray1RetardRollerPct, status: 'Ready' } : undefined,
      mpTrayRoller: mpTrayRollerPct !== null ? { percentage: mpTrayRollerPct, status: 'Ready' } : undefined,
      mpTrayRetardRoller: mpTrayRetardRollerPct !== null ? { percentage: mpTrayRetardRollerPct, status: 'Ready' } : undefined,
    } : undefined,
    inputTrays: inputTrays.length > 0 ? inputTrays : undefined,
    outputTrays: outputTrays.length > 0 ? outputTrays : undefined,
  };

  if (black === null && cyan === null && magenta === null && yellow === null && !suppliesDetails.drums) return {};

  return {
    brand: 'samsung',
    tonerBlack: black, tonerCyan: cyan, tonerMagenta: magenta, tonerYellow: yellow,
    cartridgeCodeBlack:       bk.id,     cartridgeCodeCyan:       cy.id,
    cartridgeCodeMagenta:     mg.id,     cartridgeCodeYellow:     ye.id,
    cartridgeSerialBlack:     bk.serial, cartridgeSerialCyan:     cy.serial,
    cartridgeSerialMagenta:   mg.serial, cartridgeSerialYellow:   ye.serial,
    cartridgeCapacityBlack:   bk.capa,   cartridgeCapacityCyan:   cy.capa,
    cartridgeCapacityMagenta: mg.capa,   cartridgeCapacityYellow: ye.capa,
    suppliesDetails,
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

  let drumBk: number | null = null;
  let drumCy: number | null = null;
  let drumMg: number | null = null;
  let drumYe: number | null = null;

  let currentSection: 'toner' | 'drum' | 'inputTray' | 'outputTray' | null = null;
  let currentColor: 'black' | 'cyan' | 'magenta' | 'yellow' | null = null;

  const inputTrays: Array<{ name: string; paperType?: string; paperSize?: string; level?: number; status?: string }> = [];
  const outputTrays: Array<{ name: string; capacity?: string; status?: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    if (/(?:Toner\s*Cartridge|Toner)/i.test(line)) {
      currentSection = 'toner';
      currentColor = null;
    } else if (/(?:Imaging\t*Unit|OPC|드럼|Drum\s*Unit)/i.test(line)) {
      currentSection = 'drum';
      currentColor = null;
    } else if (/(?:Input\s*Trays|Paper\s*Trays)/i.test(line)) {
      currentSection = 'inputTray';
    } else if (/(?:Output\s*Trays|Output\s*Bins)/i.test(line)) {
      currentSection = 'outputTray';
    }

    // Detect colors
    if (/(?:흑백|검정|Black|Negro)/i.test(line)) {
      currentColor = 'black';
    } else if (/(?:시안|청색|Cyan)/i.test(line)) {
      currentColor = 'cyan';
    } else if (/(?:마젠타|심홍색|Magenta)/i.test(line)) {
      currentColor = 'magenta';
    } else if (/(?:노란색|노란|Yellow|Amarillo)/i.test(line)) {
      currentColor = 'yellow';
    }

    // Extract percentage for toner or drum
    const m = line.match(/^(\d+)\s*%/);
    if (m) {
      const val = Math.min(100, Math.max(0, parseInt(m[1], 10)));
      if (currentSection === 'drum' || /(?:Imaging|Drum|Unit)/i.test(line)) {
        if (currentColor === 'black' && drumBk === null) drumBk = val;
        else if (currentColor === 'cyan' && drumCy === null) drumCy = val;
        else if (currentColor === 'magenta' && drumMg === null) drumMg = val;
        else if (currentColor === 'yellow' && drumYe === null) drumYe = val;
      } else {
        if (currentColor === 'black' && black === null) black = val;
        else if (currentColor === 'cyan' && cyan === null) cyan = val;
        else if (currentColor === 'magenta' && magenta === null) magenta = val;
        else if (currentColor === 'yellow' && yellow === null) yellow = val;
      }
    }

    // Parse Input Tray rows (e.g. Tray 1 Plain A4 LEF 0% / Ready)
    const trayMatch = line.match(/(Tray\s*\d+|Mp\s*Tray|Bandeja\s*\d+)\s+([A-Za-z0-9\s]+?)\s+([A-Za-z0-9\s]+?)\s+(\d+)\s*%/i);
    if (trayMatch) {
      inputTrays.push({
        name: trayMatch[1].trim(),
        paperType: trayMatch[2].trim(),
        paperSize: trayMatch[3].trim(),
        level: parseInt(trayMatch[4], 10),
        status: 'Ready',
      });
    }

    // Parse Output Tray rows (e.g. Standard Bin 500 sheet(s) Ready)
    const outputMatch = line.match(/(Standard\s*Bin|Output\s*Bin|Bandeja\s*Salida)\s+(\d+\s*sheet\(s\)?|\d+\s*páginas?)\s+(Ready|OK|Listo)/i);
    if (outputMatch) {
      outputTrays.push({
        name: outputMatch[1].trim(),
        capacity: outputMatch[2].trim(),
        status: outputMatch[3].trim(),
      });
    }
  }

  // Fallback for HTML table rows if regex line loop didn't catch tray details
  if (inputTrays.length === 0) {
    const trayRows = html.match(/<tr[^>]*>[\s\S]*?(Tray\d+|Tray\s*\d+|Mp\s*Tray)[\s\S]*?<\/tr>/gi);
    if (trayRows) {
      for (const tr of trayRows) {
        const cells = tr.replace(/<[^>]+>/g, '\t').split('\t').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) {
          const name = cells[0];
          const pctMatch = tr.match(/(\d+)\s*%/);
          inputTrays.push({
            name,
            paperType: cells[1] || 'Plain',
            paperSize: cells[2] || 'A4',
            level: pctMatch ? parseInt(pctMatch[1], 10) : 0,
            status: 'Ready',
          });
        }
      }
    }
  }

  // Default Standard Bin if outputTrays is empty
  if (outputTrays.length === 0 && /(?:Standard\s*Bin|Output\s*Trays)/i.test(html)) {
    outputTrays.push({ name: 'Standard Bin', capacity: '500 sheet(s)', status: 'Ready' });
  }

  const suppliesDetails = {
    toners: {
      black:   black   !== null ? { percentage: black,   status: 'Ready' } : undefined,
      cyan:    cyan    !== null ? { percentage: cyan,    status: 'Ready' } : undefined,
      magenta: magenta !== null ? { percentage: magenta, status: 'Ready' } : undefined,
      yellow:  yellow  !== null ? { percentage: yellow,  status: 'Ready' } : undefined,
    },
    drums: (drumBk !== null || drumCy !== null || drumMg !== null || drumYe !== null) ? {
      black:   drumBk !== null ? { percentage: drumBk, status: 'Ready' } : undefined,
      cyan:    drumCy !== null ? { percentage: drumCy, status: 'Ready' } : undefined,
      magenta: drumMg !== null ? { percentage: drumMg, status: 'Ready' } : undefined,
      yellow:  drumYe !== null ? { percentage: drumYe, status: 'Ready' } : undefined,
    } : undefined,
    inputTrays: inputTrays.length > 0 ? inputTrays : undefined,
    outputTrays: outputTrays.length > 0 ? outputTrays : undefined,
  };

  if (black === null && cyan === null && magenta === null && yellow === null && !suppliesDetails.drums) return {};

  return {
    brand: 'samsung',
    tonerBlack: black,
    tonerCyan: cyan,
    tonerMagenta: magenta,
    tonerYellow: yellow,
    suppliesDetails,
  };
}

export * from './samsung/index';
