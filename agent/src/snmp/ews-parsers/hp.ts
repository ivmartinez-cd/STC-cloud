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
               ?? htmlTonerPct(html, /black\s*(?:toner|cartridge|ink)/i);
  const cyan    = extractById(/id="[^"]*Cyan[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /cyan\s*(?:toner|cartridge|ink)/i);
  const magenta = extractById(/id="[^"]*Magenta[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /magenta\s*(?:toner|cartridge|ink)/i);
  const yellow  = extractById(/id="[^"]*Yellow[^"]*(?:Level|Remaining)[^"]*"[^>]*>\s*([\d]+)\s*%/i)
               ?? htmlTonerPct(html, /yellow\s*(?:toner|cartridge|ink)/i);

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
