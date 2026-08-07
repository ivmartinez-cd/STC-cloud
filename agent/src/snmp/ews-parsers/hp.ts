import { type EwsData } from './types';
import { htmlTonerPct, htmlCounter, toInt } from './helpers';

// ─── HP XML parser (ProductUsageDyn.xml) ─────────────────────────────────────

export function parseHpXml(xml: string): Partial<EwsData> {
  const v = (tag: string) => xmlVal(xml, tag);

  const total = v('TotalImpressions') ?? v('TotalPrinted')     ?? v('TotalEngineImpressions');
  const mono  = v('MonochromeImpressions') ?? v('MonochromePrinted');
  const color = v('ColorImpressions') ?? v('ColorPrinted');

  return {
    brand:      'hp',
    model:      v('MakeAndModel') ?? v('MakeAndModelBase') ?? v('ProductName') ?? v('ModelName') ?? null,
    serial:     v('SerialNumber') ?? null,
    totalPages: toInt(total),
    monoPages:  toInt(mono),
    colorPages: toInt(color),
  };
}

function xmlVal(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>\\s*([^<]+)\\s*<\\/(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

// ─── HP XML Consumables parser (ConsumableConfigDyn.xml) ─────────────────────

export function parseHpConsumablesXml(xml: string): Partial<EwsData> {
  const result: Partial<EwsData> = { brand: 'hp' };
  const blocks = xml.split(/<(?:[\w-]+:)?ConsumableInfo[^>]*>/i);

  for (const block of blocks.slice(1)) {
    const category   = xmlVal(block, 'ConsumableCategory')?.toLowerCase();
    const labelCode  = xmlVal(block, 'ConsumableLabelCode')?.toUpperCase();
    const familyName = xmlVal(block, 'ConsumableFamilyName')?.toLowerCase();

    let color: 'black' | 'cyan' | 'magenta' | 'yellow' | null = null;

    if (category === 'black' || labelCode === 'K' || (familyName && /black|negro|toner\s*k/i.test(familyName))) {
      color = 'black';
    } else if (category === 'cyan' || labelCode === 'C' || (familyName && /cyan|cian/i.test(familyName))) {
      color = 'cyan';
    } else if (category === 'magenta' || labelCode === 'M' || (familyName && /magenta/i.test(familyName))) {
      color = 'magenta';
    } else if (category === 'yellow' || labelCode === 'Y' || (familyName && /yellow|amarillo/i.test(familyName))) {
      color = 'yellow';
    }

    if (!color) continue;

    const pctStr = xmlVal(block, 'ConsumablePercentageLevelRemaining') || xmlVal(block, 'EngineTonerRemaining');
    const partNo = xmlVal(block, 'ProductNumber') || xmlVal(block, 'ConsumablePartNumber') || xmlVal(block, 'ConsumableSelectibilityNumber');
    const serialNo = xmlVal(block, 'SerialNumber') || xmlVal(block, 'ConsumableSerialNumber');

    const pct = pctStr != null ? parseInt(pctStr, 10) : null;
    const validPct = pct != null && !isNaN(pct) ? Math.min(100, Math.max(0, pct)) : null;

    if (color === 'black') {
      if (validPct != null) result.tonerBlack = validPct;
      if (partNo) result.cartridgeCodeBlack = partNo;
      if (serialNo) result.cartridgeSerialBlack = serialNo;
    } else if (color === 'cyan') {
      if (validPct != null) result.tonerCyan = validPct;
      if (partNo) result.cartridgeCodeCyan = partNo;
      if (serialNo) result.cartridgeSerialCyan = serialNo;
    } else if (color === 'magenta') {
      if (validPct != null) result.tonerMagenta = validPct;
      if (partNo) result.cartridgeCodeMagenta = partNo;
      if (serialNo) result.cartridgeSerialMagenta = serialNo;
    } else if (color === 'yellow') {
      if (validPct != null) result.tonerYellow = validPct;
      if (partNo) result.cartridgeCodeYellow = partNo;
      if (serialNo) result.cartridgeSerialYellow = serialNo;
    }
  }

  return result;
}

// ─── HP HTML parser (UsagePage) ───────────────────────────────────────────────

export function parseHpHtml(html: string): Partial<EwsData> {
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

// ─── HP FutureSmart Supplies Status parser ────────────────────────────────────

export function parseHpSupplies(html: string): Partial<EwsData> {
  const extractById = (pattern: RegExp): number | null => {
    const m = html.match(pattern);
    if (!m) return null;
    const pct = parseInt(m[1].replace(/[%\s]/g, ''), 10);
    return isNaN(pct) ? null : Math.min(100, Math.max(0, pct));
  };

  // Extract HP cartridge order number or part number near a color label
  // e.g. id="BlackCartridge1-Header_OrderNumber">CE285A or id="BlackCartridge1-InstalledPartNumber">58A (CF258A)
  const extractOrderNumber = (colorPattern: RegExp): string | null => {
    let m = html.match(new RegExp(
      colorPattern.source + '[\\s\\S]{0,2000}id="[^"]*OrderNumber[^"]*"[^>]*>\\s*([^<]+)',
      'i',
    ));
    if (!m) {
      m = html.match(new RegExp(
        colorPattern.source + '[\\s\\S]{0,2000}id="[^"]*InstalledPartNumber[^"]*"[^>]*>\\s*([^<]+)',
        'i',
      ));
    }
    return m ? m[1].trim() || null : null;
  };

  const extractSerialNumber = (colorPattern: RegExp): string | null => {
    const m = html.match(new RegExp(
      colorPattern.source + '[\\s\\S]{0,2000}id="[^"]*SerialNumber[^"]*"[^>]*>\\s*([^<]+)',
      'i',
    ));
    return m ? m[1].trim() || null : null;
  };

  const extractNumberById = (colorPattern: RegExp, idPattern: string): number | null => {
    const m = html.match(new RegExp(
      colorPattern.source + `[\\s\\S]{0,2000}id="[^"]*${idPattern}[^"]*"[^>]*>\\s*([\\d]+)`,
      'i',
    ));
    return m ? parseInt(m[1], 10) : null;
  };

  // Modern HP FutureSmart: id="BlackCartridge1-Header_Level">15%
  const black   = extractById(/id="[^"]*Black[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /black\s*(?:toner|cartridge|ink)/i)
               ?? extractHpLegacyToner(html, 'black');
  const cyan    = extractById(/id="[^"]*Cyan[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /cyan\s*(?:toner|cartridge|ink)/i)
               ?? extractHpLegacyToner(html, 'cyan');
  const magenta = extractById(/id="[^"]*Magenta[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /magenta\s*(?:toner|cartridge|ink)/i)
               ?? extractHpLegacyToner(html, 'magenta');
  const yellow  = extractById(/id="[^"]*Yellow[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /yellow\s*(?:toner|cartridge|ink)/i)
               ?? extractHpLegacyToner(html, 'yellow');

  if (black === null && cyan === null && magenta === null && yellow === null) return {};

  return {
    brand: 'hp',
    tonerBlack: black, tonerCyan: cyan, tonerMagenta: magenta, tonerYellow: yellow,
    cartridgeCodeBlack:     extractOrderNumber(/Black/i),
    cartridgeCodeCyan:      extractOrderNumber(/Cyan/i),
    cartridgeCodeMagenta:   extractOrderNumber(/Magenta/i),
    cartridgeCodeYellow:    extractOrderNumber(/Yellow/i),
    cartridgeSerialBlack:   extractSerialNumber(/Black/i),
    cartridgeSerialCyan:    extractSerialNumber(/Cyan/i),
    cartridgeSerialMagenta: extractSerialNumber(/Magenta/i),
    cartridgeSerialYellow:  extractSerialNumber(/Yellow/i),
    cartridgePrintedBlack:     extractNumberById(/Black/i, 'PagesPrintedWithSupply'),
    cartridgePrintedCyan:      extractNumberById(/Cyan/i, 'PagesPrintedWithSupply'),
    cartridgePrintedMagenta:   extractNumberById(/Magenta/i, 'PagesPrintedWithSupply'),
    cartridgePrintedYellow:    extractNumberById(/Yellow/i, 'PagesPrintedWithSupply'),
    cartridgeEstimatedBlack:     extractNumberById(/Black/i, 'EstimatedPagesRemaining'),
    cartridgeEstimatedCyan:      extractNumberById(/Cyan/i, 'EstimatedPagesRemaining'),
    cartridgeEstimatedMagenta:   extractNumberById(/Magenta/i, 'EstimatedPagesRemaining'),
    cartridgeEstimatedYellow:    extractNumberById(/Yellow/i, 'EstimatedPagesRemaining'),
  };
}

// ─── HP Legacy HTML Supplies parser (/info_suppliesStatus.html, etc.) ─────────

export function parseHpLegacyHtmlSupplies(html: string): Partial<EwsData> {
  const black   = extractHpLegacyToner(html, 'black');
  const cyan    = extractHpLegacyToner(html, 'cyan');
  const magenta = extractHpLegacyToner(html, 'magenta');
  const yellow  = extractHpLegacyToner(html, 'yellow');

  const modelMatch  = html.match(/(?:Product\s*Name|Model\s*Name|Modelo|Nombre\s*de\s*producto)[^<]{0,100}>[\s\n]*([^<]+)/i);
  const serialMatch = html.match(/(?:Serial\s*Number|Número\s*de\s*serie)[^<]{0,100}>[\s\n]*([^<]+)/i);

  const model  = modelMatch  ? modelMatch[1].trim()  : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;

  if (black === null && cyan === null && magenta === null && yellow === null && !model && !serial) {
    return {};
  }

  return {
    brand: 'hp',
    model,
    serial,
    tonerBlack: black,
    tonerCyan: cyan,
    tonerMagenta: magenta,
    tonerYellow: yellow,
  };
}

function extractHpLegacyToner(html: string, color: 'black' | 'cyan' | 'magenta' | 'yellow'): number | null {
  const colorPatterns: Record<string, RegExp> = {
    black:   /(?:black|negro|noir|schwarz|nero|cartucho\s*negro|tóner\s*negro|cartridge\s*k|\bk\b)/i,
    cyan:    /(?:cyan|cian|cartucho\s*cian|tóner\s*cian|\bc\b)/i,
    magenta: /(?:magenta|cartucho\s*magenta|tóner\s*magenta|\bm\b)/i,
    yellow:  /(?:yellow|amarillo|cartucho\s*amarillo|tóner\s*amarillo|\by\b)/i,
  };

  const pattern = colorPatterns[color];
  const colorMatch = html.match(new RegExp(pattern.source + '[\\s\\S]{0,1500}', 'i'));
  if (!colorMatch) return null;
  const block = colorMatch[0];

  // 1. Direct percentage text e.g. "75%", "75 %", "75%*"
  const pctMatch = block.match(/(\d{1,3})\s*%\s*\*?/);
  if (pctMatch) {
    const val = parseInt(pctMatch[1], 10);
    if (!isNaN(val) && val <= 100 && val >= 0) return val;
  }

  // 2. Bar width style e.g. style="width: 75%" or width="75%"
  const widthMatch = block.match(/width[:=]\s*["']?(\d{1,3})%/i);
  if (widthMatch) {
    const val = parseInt(widthMatch[1], 10);
    if (!isNaN(val) && val <= 100 && val >= 0) return val;
  }

  // 3. Level text e.g. "Nivel: 75" or "Level: 75"
  const lvlMatch = block.match(/(?:level|nivel|restante|remaining)\s*[:=]?\s*(\d{1,3})/i);
  if (lvlMatch) {
    const val = parseInt(lvlMatch[1], 10);
    if (!isNaN(val) && val <= 100 && val >= 0) return val;
  }

  return null;
}

