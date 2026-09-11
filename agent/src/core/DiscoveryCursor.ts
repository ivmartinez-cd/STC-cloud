import { createHash } from 'crypto';

/**
 * Cursor de barrido continuo (discovery). Reemplaza al modelo anterior de
 * "un scan = todos los rangos de una": el espacio declarado se recorre en
 * chunks acotados por tiempo, y la posición sobrevive entre chunks (y entre
 * reinicios del agente, ver `scan_state` en `sync/database.ts`).
 *
 * El motivo es el mismo que documenta HP SDS en su white paper de Monitoring
 * Loops: "If it takes longer than the configured time for a monitoring loop
 * to get through the list of all devices being monitored then the next run of
 * that loop commences immediately". SDS no acota el tamaño del espacio —
 * encadena vueltas. Acá se hace lo mismo, con la diferencia de que la vuelta
 * se parte en chunks para no bloquear los otros loops (el scheduler serializa
 * las tareas de red: un barrido largo y atómico hambrea meter/supplies/alerts).
 *
 * Todo acá es aritmética sobre enteros de 32 bits: avanzar N posiciones es
 * O(cantidad de rangos), NUNCA O(cantidad de IPs). Un /8 mal cargado no
 * materializa nada — sólo mueve el cursor.
 */

export interface CursorRange {
  start: string;
  end: string;
}

export interface DiscoveryCursor {
  /** Índice del rango en curso dentro del array de rangos. */
  rangeIdx: number;
  /** Cuántas IPs de ESE rango ya se consumieron. */
  offset: number;
}

export interface ChunkPlan {
  /** IPs a escanear en este chunk, en orden. */
  ips: string[];
  /** Índice del rango del que salió cada IP (mismo largo que `ips`) — el
   *  caller lo necesita para resolver `credential_ids` por rango. */
  rangeIdxOf: number[];
  /** Posición donde arrancaría el próximo chunk si se consumieran TODAS las
   *  IPs de `ips`. Si se consumen menos, usar `advanceCursor()`. */
  next: DiscoveryCursor;
  /** `true` si `ips` llega hasta el final del espacio declarado: consumirlas
   *  todas cierra la vuelta. */
  reachesEnd: boolean;
}

export const CURSOR_START: DiscoveryCursor = { rangeIdx: 0, offset: 0 };

const toInt = (ip: string): number => ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
const toIp = (n: number): string => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/** Cantidad de IPs declaradas por un rango. `start > end` (dato corrupto) cuenta 0. */
export function rangeSize(range: CursorRange): number {
  const size = toInt(range.end) - toInt(range.start) + 1;
  return size > 0 ? size : 0;
}

/** Suma de IPs declaradas — el "total" del progreso de la vuelta. */
export function totalDeclaredIps(ranges: CursorRange[]): number {
  return ranges.reduce((acc, r) => acc + rangeSize(r), 0);
}

/**
 * Identidad del ESPACIO a recorrer. Si cambia, el cursor guardado ya no
 * significa lo mismo y hay que reiniciar la vuelta.
 *
 * Deliberadamente NO incluye `credential_ids` ni `label`: cambiar qué
 * credencial se prueba, o renombrar una sede, no cambia QUÉ IPs se recorren
 * ni en qué orden — reiniciar la vuelta por eso perdería el progreso sin
 * ningún motivo.
 */
export function fingerprintRanges(ranges: CursorRange[]): string {
  const canonical = ranges.map((r) => `${r.start}-${r.end}`).join(',');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** Normaliza un cursor que quedó fuera de rango (config que se achicó, dato corrupto). */
function clamp(ranges: CursorRange[], cursor: DiscoveryCursor): DiscoveryCursor {
  if (cursor.rangeIdx < 0 || cursor.rangeIdx >= ranges.length || cursor.offset < 0) return CURSOR_START;
  if (cursor.offset >= rangeSize(ranges[cursor.rangeIdx])) {
    return { rangeIdx: cursor.rangeIdx + 1, offset: 0 };
  }
  return cursor;
}

/**
 * Avanza el cursor `count` posiciones. Si llega al final del espacio
 * declarado, vuelve al principio y marca `lapComplete` — nunca sigue de
 * largo dentro de la misma llamada (un chunk como mucho cierra UNA vuelta,
 * no dos).
 */
export function advanceCursor(
  ranges: CursorRange[],
  cursor: DiscoveryCursor,
  count: number
): { next: DiscoveryCursor; lapComplete: boolean } {
  if (ranges.length === 0) return { next: CURSOR_START, lapComplete: true };

  let { rangeIdx, offset } = clamp(ranges, cursor);
  let remaining = Math.max(0, count);

  while (rangeIdx < ranges.length) {
    const available = rangeSize(ranges[rangeIdx]) - offset;
    if (available <= 0) { rangeIdx++; offset = 0; continue; }
    if (remaining < available) return { next: { rangeIdx, offset: offset + remaining }, lapComplete: false };
    remaining -= available;
    rangeIdx++;
    offset = 0;
    if (remaining === 0) {
      // Consumió justo hasta el borde: si no quedan más rangos, cerró la vuelta.
      while (rangeIdx < ranges.length && rangeSize(ranges[rangeIdx]) === 0) rangeIdx++;
      return rangeIdx >= ranges.length
        ? { next: CURSOR_START, lapComplete: true }
        : { next: { rangeIdx, offset: 0 }, lapComplete: false };
    }
  }
  return { next: CURSOR_START, lapComplete: true };
}

/**
 * Materializa las próximas `maxIps` IPs desde `cursor`. Corta en el final del
 * espacio declarado (nunca da la vuelta dentro del mismo chunk) y nunca
 * materializa más de `maxIps` — es el único lugar donde se arman strings de
 * IP, y está acotado por el tope de chunk del caller.
 */
export function planChunk(ranges: CursorRange[], cursor: DiscoveryCursor, maxIps: number): ChunkPlan {
  const ips: string[] = [];
  const rangeIdxOf: number[] = [];
  if (ranges.length === 0 || maxIps <= 0) {
    return { ips, rangeIdxOf, next: CURSOR_START, reachesEnd: true };
  }

  let { rangeIdx, offset } = clamp(ranges, cursor);

  while (rangeIdx < ranges.length && ips.length < maxIps) {
    const size = rangeSize(ranges[rangeIdx]);
    if (offset >= size) { rangeIdx++; offset = 0; continue; }

    const base = toInt(ranges[rangeIdx].start);
    const take = Math.min(size - offset, maxIps - ips.length);
    for (let i = 0; i < take; i++) {
      ips.push(toIp(base + offset + i));
      rangeIdxOf.push(rangeIdx);
    }
    offset += take;
    if (offset >= size) { rangeIdx++; offset = 0; }
  }

  const reachesEnd = rangeIdx >= ranges.length;
  return {
    ips,
    rangeIdxOf,
    next: reachesEnd ? CURSOR_START : { rangeIdx, offset },
    reachesEnd,
  };
}
