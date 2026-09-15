import { type EwsData } from './types';
import { buildLexmarkStatusSupplies } from './lexmark-status';

// ─── Lexmark PrinterStatus parser ────────────────────────────────────────────

export function parseLexmarkPrinterStatus(html: string): Partial<EwsData> {
  const extractToner = (pattern: RegExp): number | null => {
    const m = html.match(pattern);
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return isNaN(v) ? null : Math.min(100, Math.max(0, v));
  };

  const black   = extractToner(/(?:T.ner\s+negro|Black\s+T.ner|T.ner\s+Black|Negro\s+T.ner)[^<]*?(\d+)\s*%/i);
  const cyan    = extractToner(/(?:T.ner\s+cian|Cyan\s+T.ner|T.ner\s+Cyan|Cian\s+T.ner)[^<]*?(\d+)\s*%/i);
  const magenta = extractToner(/(?:T.ner\s+magenta|Magenta\s+T.ner|T.ner\s+Magenta)[^<]*?(\d+)\s*%/i);
  const yellow  = extractToner(/(?:T.ner\s+amarillo|Yellow\s+T.ner|T.ner\s+Yellow|Amarillo\s+T.ner)[^<]*?(\d+)\s*%/i);

  // Lectura estructurada (`lexmark-status.ts`): además de los niveles trae el
  // rendimiento del cartucho, la unidad de imagen y el kit de mantenimiento,
  // que ninguna otra fuente da (SNMP sólo entrega el tóner y las bandejas).
  // Manda ella; las regex de arriba quedan de respaldo para firmwares que no
  // usen el comentario `<!-- Toner Level -->`.
  const structured = buildLexmarkStatusSupplies(html);
  const lvl = (c: 'black' | 'cyan' | 'magenta' | 'yellow', fallback: number | null) =>
    structured?.toners[c]?.percentage ?? fallback;
  const levels = {
    black: lvl('black', black), cyan: lvl('cyan', cyan),
    magenta: lvl('magenta', magenta), yellow: lvl('yellow', yellow),
  };

  const nothing = Object.values(levels).every((v) => v === null);
  if (nothing && !structured) return {};

  return {
    brand: 'lexmark',
    tonerBlack: levels.black, tonerCyan: levels.cyan,
    tonerMagenta: levels.magenta, tonerYellow: levels.yellow,
    suppliesDetails: structured
      ? {
          toners: structured.toners,
          drums: Object.keys(structured.drums).length ? structured.drums : undefined,
          maintenance: Object.keys(structured.maintenance).length ? structured.maintenance : undefined,
        } as Partial<EwsData>['suppliesDetails']
      : undefined,
  };
}

// ─── Lexmark EWS parser ──────────────────────────────────────────────────────

export function parseLexmarkEws(html: string): Partial<EwsData> {
  const pageMatch = html.match(/(?:C.mputo de p.g\.|Page Count|Total Pages)[^=]*=\s*(\d+)/i);
  const serialMatch = html.match(/(?:N.mero de serie|Serial Number|Serial\s*(?:Num)?)[^=]*=\s*([A-Za-z0-9\-]+)/i);
  const modelMatch = html.match(/<center><FONT[^>]*>([^<]+)<\/FONT><\/center>/i) ?? 
                     html.match(/<title>([^<]+)<\/title>/i);

  const total = pageMatch ? Number(pageMatch[1]) : undefined;
  const serial = serialMatch ? serialMatch[1].trim() : undefined;
  // El <title> sólo es fiable si la página trajo contador o serial (evita registrar cualquier web como "Lexmark").
  const model = (modelMatch && (total !== undefined || serial)) ? modelMatch[1].trim() : undefined;
  if (total === undefined && !serial) return {};

  return {
    brand:      'lexmark',
    model:      model,
    serial:     serial,
    totalPages: total ?? undefined,
    monoPages:  total ?? undefined,
    colorPages: 0,
  };
}
