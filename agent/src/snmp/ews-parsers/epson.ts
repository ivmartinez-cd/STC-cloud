import type { EwsData, SuppliesItem } from './types';

/**
 * Epson Web Config (WorkForce Pro WF-C5xxx y familia) — el EWS que sirven los
 * equipos Epson de red por HTTPS.
 *
 * Igual que con Samsung, acá NO se leen etiquetas: el equipo sirve su consola
 * en el idioma configurado (el WF-C5891 de Canal Directo la sirve en español)
 * y un parser anclado a "Ink" o "Total pages" se rompe con sólo cambiar ese
 * menú. Los dos anclajes que usamos son estables en cualquier idioma:
 *
 *  - **Tinta**: el nivel está en el gradiente CSS del tanque, y el nombre del
 *    color es un token que no se traduce (`BK`/`Y`/`M`/`C`).
 *
 *        <li class='tank'>
 *          <div class='tank' style='background:linear-gradient(to top,
 *               #FFF200 0%, #FFF200 39%, #000000 39%, #BFC2C5 41%, ...)'>
 *          <div class='clrname'>Y</div>
 *
 *    El nivel es donde TERMINA la primera franja de color: 39%.
 *    La caja de mantenimiento es el único `<li class='tank'>` sin `clrname`;
 *    se reconoce por su ícono (`Icn_Mb.PNG`), que tampoco depende del idioma.
 *
 *  - **Contadores**: son pares `<dt class="key">…</dt><dd class="value">…</dd>`
 *    sin id propio, así que se toman por posición dentro del primer grupo
 *    PERO se validan por aritmética: total = mono + color. Si no cierra, no se
 *    devuelve nada — mejor sin dato que con el número cambiado de lugar.
 *
 * Epson no expone part number ni serie del cartucho en esta consola: esos
 * campos quedan en `null` a propósito (ver la tabla de límites en
 * `docs/dev/ALTA_DE_MODELOS.md`).
 */

/** `#FFF200 0%, #FFF200 39%, #000000 39%` → 39. El nivel es el fin de la primera franja. */
export function levelFromGradient(style: string): number | null {
  const stops = [...style.matchAll(/(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s+(\d+(?:\.\d+)?)%/gi)]
    .map((m) => ({ color: m[1].toLowerCase(), pct: Number(m[2]) }));
  if (stops.length < 2) return null;
  const first = stops[0].color;
  let end: number | null = null;
  for (const s of stops) {
    if (s.color !== first) break;
    end = s.pct;
  }
  if (end == null || !Number.isFinite(end)) return null;
  return Math.min(100, Math.max(0, Math.round(end)));
}

const COLOR_BY_TOKEN: Record<string, 'black' | 'cyan' | 'magenta' | 'yellow'> = {
  BK: 'black', K: 'black', C: 'cyan', M: 'magenta', Y: 'yellow',
};

export interface EpsonTank {
  color: 'black' | 'cyan' | 'magenta' | 'yellow' | null;
  /** La caja de mantenimiento es un tanque sin color (se reconoce por el ícono). */
  maintenanceBox: boolean;
  level: number | null;
}

const TANK_RX = /<li[^>]*class=['"]tank['"][^>]*>([\s\S]*?)<\/li>/gi;

/** Tanques de tinta + caja de mantenimiento, en el orden en que los sirve el equipo. */
export function parseEpsonTanks(html: string): EpsonTank[] {
  const out: EpsonTank[] = [];
  for (const m of html.matchAll(TANK_RX)) {
    const block = m[1];
    const style = block.match(/style=['"]([^'"]*linear-gradient[^'"]*)['"]/i)?.[1];
    if (!style) continue;
    const token = block.match(/class=['"]clrname['"][^>]*>\s*([A-Za-z]{1,2})\s*</i)?.[1];
    const maintenanceBox = !token && /Icn_Mb\.PNG/i.test(block);
    out.push({
      color: token ? (COLOR_BY_TOKEN[token.toUpperCase()] ?? null) : null,
      maintenanceBox,
      level: levelFromGradient(style),
    });
  }
  return out;
}

function tonerItem(level: number | null): SuppliesItem {
  return {
    percentage: level,
    status: level === null ? null : level <= 0 ? 'Empty' : level <= 10 ? 'Low' : 'Ready',
    // Epson no publica part number ni serie del cartucho en Web Config.
    code: null, serial: null, capacity: null, printed: null, remainingPages: null,
  };
}

/** `PRESENTATION/HTML/TOP/PRTINFO.HTML` — identidad de red + niveles de tinta. */
export function parseEpsonPrtInfo(html: string): Partial<EwsData> {
  const tanks = parseEpsonTanks(html);
  if (!tanks.length) return {};
  const out: Partial<EwsData> = { brand: 'epson' };

  const toners: NonNullable<NonNullable<EwsData['suppliesDetails']>['toners']> = {};
  const maintenance: Record<string, unknown> = {};
  for (const t of tanks) {
    if (t.color) toners[t.color] = tonerItem(t.level);
    else if (t.maintenanceBox) maintenance.wasteToner = tonerItem(t.level);
  }
  const K = { black: 'Black', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Yellow' } as const;
  for (const [key, suffix] of Object.entries(K)) {
    const pct = toners[key as keyof typeof toners]?.percentage;
    if (pct != null) out[`toner${suffix}`] = pct;
  }

  out.model = html.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1] ?? undefined;
  out.hostname = itemValue(html, /class=['"]item-value['"][^>]*>\s*(EPSON[0-9A-F]+)\s*</i);
  out.mac = itemValue(html, /class=['"]item-value['"][^>]*>\s*((?:[0-9A-F]{2}:){5}[0-9A-F]{2})\s*</i);
  out.suppliesDetails = {
    toners,
    maintenance: Object.keys(maintenance).length ? maintenance : undefined,
  } as EwsData['suppliesDetails'];
  return out;
}

function itemValue(html: string, rx: RegExp): string | undefined {
  return html.match(rx)?.[1] ?? undefined;
}

/**
 * `PRESENTATION/ADVANCED/INFO_MENTINFO/TOP` — contadores.
 * Los tres primeros valores del primer grupo son total / mono / color, en ese
 * orden. Se aceptan SÓLO si `total === mono + color`: sin esa comprobación un
 * cambio de orden en el firmware metería el contador de color en el total.
 */
export function parseEpsonCounters(html: string): Partial<EwsData> {
  const values = [...html.matchAll(/class=['"]value[^'"]*['"][^>]*>\s*<div[^>]*>\s*([^<]*?)\s*<\/div>/gi)]
    .map((m) => m[1].replace(/[.,\s]/g, ''))
    .filter((v) => /^\d+$/.test(v))
    .map(Number);
  if (values.length < 3) return {};
  const [total, mono, color] = values;
  if (total !== mono + color) return {};
  return { brand: 'epson', totalPages: total, monoPages: mono, colorPages: color };
}
