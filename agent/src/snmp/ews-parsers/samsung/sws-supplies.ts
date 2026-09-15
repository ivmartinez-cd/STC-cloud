import type { SuppliesItem } from '../types';

/**
 * Lectura ESTRUCTURADA de `suppliesView.sws` (Samsung XOA / Solution Web
 * Service: MultiXpress M5370LX, X4300LX, K4300LX…).
 *
 * El parser viejo (`parseSamsungSolutionSupplies`) raspa el texto plano y
 * sólo saca el porcentaje, porque busca etiquetas en inglés/coreano. Eso
 * falla apenas cambia el idioma del EWS: el M5370LX de Canal Directo sirve
 * la página en coreano aunque el navegador la muestre en inglés (el idioma
 * sale de la sesión, no del `Accept-Language`), y así quedaban en `null` la
 * serie del cartucho, el SKU, la capacidad y las impresiones — justo los
 * campos que el modal "Detalles del consumible" necesita.
 *
 * Acá no se lee NINGUNA etiqueta: el firmware marca cada valor con un `id`
 * propio, que es el mismo en todos los idiomas.
 *
 *   id='statusCont'    → estado           ("준비" / "Ready")
 *   id='remainCont'    → nivel "85 %"  Y TAMBIÉN el model ID "MLT-D358S"
 *   id='pageCont'      → impresiones     ("3111 면 인쇄")
 *   id='capacityCont'  → capacidad       ("30 K")
 *   id='cartCont'      → serie del CRUM  ("CRUM-24121814413")
 *
 * `remainCont` está repetido a propósito por el firmware (mismo `id` para el
 * nivel y para el model ID): se distinguen por el formato del valor, el que
 * termina en `%` es el nivel.
 *
 * El color sale de la clase CSS del medidor (`black_center`, `cyan_center`…),
 * que tampoco depende del idioma; el título localizado queda sólo de respaldo.
 */

export interface SwsSupplyBlock {
  kind: 'toner' | 'drum';
  color: 'black' | 'cyan' | 'magenta' | 'yellow' | null;
  item: SuppliesItem;
}

const CELL_RX = /id='([A-Za-z0-9_]+)'[^>]*>([^<]*)/g;
const SUBTITLE_RX = /id='subTitle\d+'/g;
const GAUGE_RX = /class='(black|cyan|magenta|yellow)_center'/i;

const COLOR_BY_TITLE: Array<['black' | 'cyan' | 'magenta' | 'yellow', RegExp]> = [
  ['black', /검정|흑백|black|negro|schwarz|noir/i],
  ['cyan', /시안|청색|cyan|cian/i],
  ['magenta', /마젠타|심홍색|magenta/i],
  ['yellow', /노란|노랑|yellow|amarillo|gelb|jaune/i],
];

/** "30 K" → 30000 · "100 K" → 100000 · "3111 면 인쇄" → 3111 · "" → null. */
export function swsNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] ? (/[Kk]/.test(m[2]) ? 1000 : 1_000_000) : 1;
  return Math.round(n * mult);
}

/**
 * Capacidad: el firmware informa "0 K" cuando NO la conoce (visto en un
 * M458x real de ISSN por el túnel EWS, 15/09/2026). Tomarlo como 0 haría que
 * la ficha muestre "capacidad 0" y, peor, que `remainingPages` dé 0 con el
 * cartucho al 92%. Un 0 acá es "sin dato", no "vacío". En `printed` en cambio
 * el 0 SÍ es real (un rodillo sin uso informa 0), por eso no se filtra ahí.
 */
function capacityOrNull(raw: string | undefined): number | null {
  const n = swsNumber(raw);
  return n != null && n > 0 ? n : null;
}

function pct(raw: string | undefined): number | null {
  const m = raw?.match(/(\d+)\s*%/);
  if (!m) return null;
  return Math.min(100, Math.max(0, Number(m[1])));
}

interface Cell { id: string; value: string }

function cellsOf(fragment: string): Cell[] {
  const out: Cell[] = [];
  for (const m of fragment.matchAll(CELL_RX)) {
    const value = m[2].replace(/&nbsp;/gi, ' ').trim();
    if (value) out.push({ id: m[1], value });
  }
  return out;
}

/** Trozos del HTML entre `subTitleN` y `subTitleN` — un consumible por trozo. */
function blockFragments(html: string): string[] {
  const starts = [...html.matchAll(SUBTITLE_RX)].map((m) => m.index!);
  return starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length));
}

function colorOf(fragment: string, cells: Cell[]): SwsSupplyBlock['color'] {
  const gauge = fragment.match(GAUGE_RX);
  if (gauge) return gauge[1].toLowerCase() as SwsSupplyBlock['color'];
  const title = cells.find((c) => /^subTitle/.test(c.id))?.value ?? '';
  return COLOR_BY_TITLE.find(([, rx]) => rx.test(title))?.[0] ?? null;
}

function itemOf(cells: Cell[]): SuppliesItem {
  const byId = (id: string) => cells.find((c) => c.id === id)?.value;
  const remains = cells.filter((c) => c.id === 'remainCont').map((c) => c.value);
  const capacityCell = cells.find((c) => /capacity/i.test(c.id))?.value;
  const capacity = capacityOrNull(capacityCell);
  const level = pct(remains.find((v) => /%/.test(v)));
  return {
    percentage: level,
    // El estado que sirve el equipo viene en el idioma de la sesión del EWS
    // ("준비" acá): se deriva del nivel, como en `generic-printer-mib`, en vez
    // de guardar una cadena localizada que después nadie puede comparar.
    status: level === null ? null : level <= 0 ? 'Empty' : level <= 10 ? 'Low' : 'Ready',
    // El `remainCont` que NO es un porcentaje es el model ID (SKU del cartucho).
    code: remains.find((v) => !/%/.test(v)) ?? null,
    serial: byId('cartCont') ?? null,
    capacity,
    printed: swsNumber(byId('pageCont')),
    // El equipo informa capacidad (rendimiento) y nivel, no las páginas que
    // quedan: se derivan igual que en el resto del sistema, nunca se inventan.
    remainingPages: capacity != null && level != null ? Math.round((capacity * level) / 100) : null,
  };
}

/** Cartuchos y tambores de `suppliesView.sws`. Vacío si el firmware no usa estos `id`. */
export function parseSwsSupplyBlocks(html: string): SwsSupplyBlock[] {
  const out: SwsSupplyBlock[] = [];
  for (const fragment of blockFragments(html)) {
    const cells = cellsOf(fragment);
    // Un bloque de consumible es el que trae serie de CRUM o capacidad; el
    // resto de los `subTitle` son secciones sueltas (revelador, accesorios).
    if (!cells.some((c) => c.id === 'cartCont' || /capacity/i.test(c.id))) continue;
    const isDrum = cells.some((c) => /imaging/i.test(c.id));
    out.push({ kind: isDrum ? 'drum' : 'toner', color: colorOf(fragment, cells), item: itemOf(cells) });
  }
  return out;
}

/** `id` → slot de mantenimiento. Los valores vienen como "usadas/vida útil". */
const MAINTENANCE_SLOTS: Record<string, string> = {
  fuserAssemblyRemaining: 'fuser',
  transferUnitBeltImpressions: 'transferBelt',
  t2RollerLife: 'transferRoller',
  tray1RollerLife: 'tray1Roller',
  mpTrayRollerLife: 'mpTrayRoller',
  // Rodillos de retardo: los expone el M458x (no el M5370LX) y tienen slot
  // propio en `SuppliesDetails.maintenance`, así que el portal los etiqueta
  // como "Rodillo de retardo bandeja 1" en vez de mandarlos al cajón `other`.
  tray1RtdRollerLife: 'tray1RetardRoller',
  mpTrayRtdRollerLife: 'mpTrayRetardRoller',
};

/** `id` → nombre legible de los que no tienen slot propio en `SuppliesDetails`. */
const MAINTENANCE_OTHER: Record<string, string> = {
  mpHolderPadLife: 'Almohadilla de bandeja multiuso',
  aDFRollerLife: 'Rodillo del ADF',
  aDFRollerPadLife: 'Rodillo de retardo del ADF',
};

export interface SwsMaintenance {
  slots: Record<string, SuppliesItem>;
  other: Array<{ name: string; percentage: number | null; maxCapacity: number | null; currentCount: number | null }>;
  wasteTonerStatus: string | null;
}

function lifeItem(raw: string): { percentage: number; used: number; max: number } | null {
  const m = raw.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const used = Number(m[1]), max = Number(m[2]);
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return null;
  return { percentage: Math.min(100, Math.max(0, Math.round((1 - used / max) * 100))), used, max };
}

/**
 * Vida útil de fusor, banda y rodillos. Todos los `id` son únicos en la
 * página, así que se buscan en todo el documento y no hace falta ubicarlos
 * en un bloque. El porcentaje es "lo que queda" = 1 − usadas/vida útil.
 */
export function parseSwsMaintenance(html: string): SwsMaintenance {
  const cells = cellsOf(html);
  const slots: Record<string, SuppliesItem> = {};
  const other: SwsMaintenance['other'] = [];
  for (const cell of cells) {
    const life = lifeItem(cell.value);
    const slot = MAINTENANCE_SLOTS[cell.id];
    if (slot && life) {
      slots[slot] = { percentage: life.percentage, capacity: life.max, printed: life.used };
    } else if (MAINTENANCE_OTHER[cell.id] && life) {
      other.push({ name: MAINTENANCE_OTHER[cell.id], percentage: life.percentage, maxCapacity: life.max, currentCount: life.used });
    }
  }
  const waste = cells.find((c) => c.id === 'wasteTonerContainer')?.value ?? null;
  return { slots, other, wasteTonerStatus: waste };
}

type TonerColor = 'black' | 'cyan' | 'magenta' | 'yellow';

export interface SwsSuppliesDetails {
  toners: Partial<Record<TonerColor, SuppliesItem>>;
  drums: Partial<Record<TonerColor, SuppliesItem>>;
  maintenance: Record<string, unknown>;
}

/**
 * Arma el `suppliesDetails` de un `suppliesView.sws`. Devuelve `null` si el
 * firmware no expone los `id` estructurados: ahí manda el raspado por texto
 * de `parseSamsungSolutionSupplies`, que es lo que había antes.
 *
 * Un equipo mono suele traer un solo bloque sin clase de color en el medidor:
 * si hay exactamente un cartucho y no se pudo determinar el color, es negro.
 */
export function buildSwsSuppliesDetails(html: string): SwsSuppliesDetails | null {
  const blocks = parseSwsSupplyBlocks(html);
  const maint = parseSwsMaintenance(html);
  if (!blocks.length && !Object.keys(maint.slots).length && !maint.other.length) return null;

  const toners: Partial<Record<TonerColor, SuppliesItem>> = {};
  const drums: Partial<Record<TonerColor, SuppliesItem>> = {};
  const onlyToner = blocks.filter((b) => b.kind === 'toner').length === 1;
  for (const b of blocks) {
    const color = b.color ?? (b.kind === 'toner' && onlyToner ? 'black' : null);
    if (!color) continue;
    const target = b.kind === 'drum' ? drums : toners;
    if (!target[color]) target[color] = b.item;
  }

  const maintenance: Record<string, unknown> = { ...maint.slots };
  // A diferencia de los cartuchos, el depósito de residuos NO informa nivel:
  // el string del equipo ("보통" / "거의 가득 참") es la única señal que hay, así
  // que se guarda crudo — igual que el `SupplyState` de HP, que también viene
  // en el idioma del EWS. Si hubiera porcentaje, se derivaría como los demás.
  if (maint.wasteTonerStatus) maintenance.wasteToner = { percentage: null, status: maint.wasteTonerStatus };
  if (maint.other.length) maintenance.other = maint.other;

  return { toners, drums, maintenance };
}
