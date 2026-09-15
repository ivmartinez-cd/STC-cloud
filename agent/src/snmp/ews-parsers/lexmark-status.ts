import type { SuppliesItem } from './types';

/**
 * Lectura estructurada de `PrinterStatus.html` (Lexmark CGI).
 *
 * El parser viejo (`parseLexmarkPrinterStatus`) buscaba literalmente
 * `"Tóner negro"` / `"Black Toner"`. Contra la flota real eso falla: el
 * X656de dice **"Tóner negro 100%"** pero el MX611dhe dice **"Cartucho negro
 * ~100%"**, así que en ese equipo el parser devolvía `{}` y el nivel que se
 * veía en el portal venía de SNMP, no de acá. Verificado el 15/09/2026 sobre
 * los dos equipos, traídos por el túnel EWS.
 *
 * Anclajes elegidos (ver la regla en `docs/dev/ALTA_DE_MODELOS.md`):
 *
 *  - **Sección de tóner**: el comentario HTML `<!-- Toner Level -->`. El
 *    firmware traduce las etiquetas visibles pero NO los comentarios del
 *    fuente, así que es estable en cualquier idioma.
 *  - **Color**: palabra clave multiidioma sobre la etiqueta de la fila, sin
 *    exigir que diga "tóner" ni "cartucho" — esa es justo la parte que varía.
 *  - **Tabla final** (capacidad / kit / unidad de imagen): no tiene ningún
 *    comentario ni `id` que la marque, así que se clasifica por la FORMA del
 *    valor (un número de 4+ cifras = rendimiento en páginas; `~N%` = nivel) y
 *    recién para distinguir kit de unidad de imagen se usan palabras clave.
 *
 * Lexmark no publica part number ni serie de cartucho en ninguna de sus
 * páginas (se revisó también `deviceinfo.html`: sólo firmware). Esos campos
 * quedan en `null`.
 */

type TonerColor = 'black' | 'cyan' | 'magenta' | 'yellow';

/** Sobre la ETIQUETA de la fila, no sobre la palabra "tóner"/"cartucho". */
const COLOR_KEYWORDS: Array<[TonerColor, RegExp]> = [
  ['black', /\b(negro|black|noir|schwarz|preto|nero)\b/i],
  ['cyan', /\b(cian|cyan|ciano)\b/i],
  ['magenta', /\b(magenta)\b/i],
  ['yellow', /\b(amarillo|yellow|jaune|gelb|amarelo|giallo)\b/i],
];

function colorOf(label: string): TonerColor | null {
  return COLOR_KEYWORDS.find(([, rx]) => rx.test(label))?.[0] ?? null;
}

/** `25.000` / `25,000` / `25000` → 25000. Ignora números chicos (porcentajes, velocidad). */
function pagesFrom(value: string): number | null {
  for (const m of value.matchAll(/\d[\d.,]{3,}/g)) {
    const n = Number(m[0].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n >= 1000) return n;
  }
  return null;
}

/** `~100%` / `100 %` → 100. `null` si el texto no es SÓLO un porcentaje. */
function pctFrom(value: string): number | null {
  const m = value.trim().match(/^~?\s*(\d{1,3})\s*%$/);
  if (!m) return null;
  return Math.min(100, Math.max(0, Number(m[1])));
}

const TONER_SECTION = /<!--\s*Toner Level\s*-->/i;
const BOLD_ROW = /<B>([^<]*?)<\/B>/gi;

/** Niveles por color. El `<!-- Toner Level -->` acota la zona; si no está, se busca en todo el documento. */
export function parseLexmarkTonerLevels(html: string): Partial<Record<TonerColor, number>> {
  const at = html.search(TONER_SECTION);
  const section = at >= 0 ? html.slice(at, at + 4000) : html;
  const out: Partial<Record<TonerColor, number>> = {};
  for (const m of section.matchAll(BOLD_ROW)) {
    const text = m[1].replace(/&nbsp;/gi, ' ').trim();
    const pctMatch = text.match(/~?\s*(\d{1,3})\s*%\s*$/);
    if (!pctMatch) continue;
    const color = colorOf(text);
    if (!color || out[color] != null) continue;
    out[color] = Math.min(100, Math.max(0, Number(pctMatch[1])));
  }
  return out;
}

export interface LexmarkSupplyInfo {
  /** Rendimiento declarado del cartucho, en páginas ("Aproximadamente 20.000 páginas al 5%"). */
  cartridgeYield: number | null;
  /** Vida restante de la unidad de imagen / fotoconductor. */
  imagingUnitPct: number | null;
  /** Vida restante del kit de mantenimiento. */
  maintenanceKitPct: number | null;
}

const IMAGING_RX = /unidad\s*(de\s*)?imagen|imaging\s*(unit|kit)|photoconductor|fotoconductor|tambor|drum|trommel/i;
const MAINTENANCE_RX = /mantenimient|maintenance|wartung|entretien|manuten/i;

/** Pares `<TD><B>etiqueta</B></TD><TD>valor</TD>` de la tabla de resumen del final. */
const PAIR_RX = /<B>([^<]*?)<\/B>\s*<\/TD>\s*<TD[^>]*>\s*([^<]*?)\s*<\/TD>/gi;

export function parseLexmarkSupplyInfo(html: string): LexmarkSupplyInfo {
  const out: LexmarkSupplyInfo = { cartridgeYield: null, imagingUnitPct: null, maintenanceKitPct: null };
  for (const m of html.matchAll(PAIR_RX)) {
    const label = m[1].replace(/&nbsp;/gi, ' ').trim();
    const value = m[2].replace(/&nbsp;/gi, ' ').trim();
    const pct = pctFrom(value);
    if (pct !== null) {
      if (out.imagingUnitPct === null && IMAGING_RX.test(label)) out.imagingUnitPct = pct;
      else if (out.maintenanceKitPct === null && MAINTENANCE_RX.test(label)) out.maintenanceKitPct = pct;
      continue;
    }
    // El rendimiento es el único valor de la tabla con un número de 4+ cifras.
    if (out.cartridgeYield === null) out.cartridgeYield = pagesFrom(value);
  }
  return out;
}

function item(pct: number | null, capacity: number | null = null): SuppliesItem {
  return {
    percentage: pct,
    status: pct === null ? null : pct <= 0 ? 'Empty' : pct <= 10 ? 'Low' : 'Ready',
    // Lexmark no publica ninguno de estos por EWS.
    code: null, serial: null, printed: null,
    capacity,
    remainingPages: capacity != null && pct != null ? Math.round((capacity * pct) / 100) : null,
  };
}

export interface LexmarkStatusSupplies {
  toners: Partial<Record<TonerColor, SuppliesItem>>;
  drums: Partial<Record<TonerColor, SuppliesItem>>;
  maintenance: Record<string, unknown>;
}

/**
 * Arma el `suppliesDetails` de la página de estado. `null` si no se pudo
 * sacar ni un nivel: ahí manda SNMP, que es lo que venía pasando.
 *
 * El rendimiento se aplica SÓLO al negro: los dos equipos de la flota que
 * sirven esta página son mono y la fila viene sin color. Si aparece un
 * Lexmark color que liste un rendimiento por cartucho, hay que revisar acá.
 */
export function buildLexmarkStatusSupplies(html: string): LexmarkStatusSupplies | null {
  const levels = parseLexmarkTonerLevels(html);
  const info = parseLexmarkSupplyInfo(html);
  const colors = Object.keys(levels) as TonerColor[];
  if (!colors.length && info.imagingUnitPct === null && info.maintenanceKitPct === null) return null;

  const toners: Partial<Record<TonerColor, SuppliesItem>> = {};
  for (const c of colors) {
    toners[c] = item(levels[c] ?? null, c === 'black' ? info.cartridgeYield : null);
  }

  const drums: Partial<Record<TonerColor, SuppliesItem>> = {};
  if (info.imagingUnitPct !== null) drums.black = item(info.imagingUnitPct);

  const maintenance: Record<string, unknown> = {};
  if (info.maintenanceKitPct !== null) {
    maintenance.other = [{
      name: 'Kit de mantenimiento',
      percentage: info.maintenanceKitPct,
      maxCapacity: null,
      currentCount: null,
    }];
  }
  return { toners, drums, maintenance };
}
