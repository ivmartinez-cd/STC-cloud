import type { IpRange } from '../../../shared/types/agents';

/**
 * Carga masiva de `ip_ranges` desde texto pegado — lógica PURA (sin React,
 * sin red), espejo en el portal de `cloud/src/shared/domain/ip-range-spec`.
 * Nació de un caso real: un cliente con 59 rangos exportados del sistema
 * viejo como un único string separado por comas
 * (`10.10.7.1-10.10.7.254,10.7.7.1-10.7.7.254,...`), imposible de cargar a
 * mano de a una tarjeta por rango.
 *
 * La validación que MANDA sigue siendo la del cloud (`validateIpRangeSpecs`)
 * al guardar: acá se valida lo mismo pero antes, para que el operador corrija
 * el pegado en vez de comerse un 400 con 59 rangos en el formulario.
 */

/** Topes del contrato compartido (pool separado para hostname: son DNS
 *  secuencial con timeout de 4 s, modelo de costo distinto al de un rango). */
export const MAX_SPECS = 256;
export const MAX_HOSTNAME_SPECS = 32;
export const MAX_TOTAL_DECLARED_IPS = 65_536;

/** Fórmula de la vuelta completa del contrato: `(totalIps / 10) * 2 s` —
 *  `CONCURRENCY_LIMIT` del agente y 2 s de peor caso por IP muerta. */
const CONCURRENCY = 10;
const WORST_CASE_SECONDS_PER_IP = 2;
/** Warning NO bloqueante: pasada esta duración la vuelta es demasiado lenta. */
export const LAP_WARN_MINUTES = 60;

/** Mismo criterio que el cloud (RFC 1123, al menos un label — admite nombre
 *  corto sin dominio, resoluble por DNS/mDNS local). */
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;
/** Un token de sólo dígitos y puntos es SIEMPRE un intento de IP: si cayera al
 *  validador de hostname, un typo como `10.10.7` pasaría como nombre DNS
 *  válido y el operador nunca se enteraría de que perdió ese rango. */
const NUMERIC_RE = /^[0-9.]+$/;
const NUMERIC_PAIR_RE = /^[0-9.]+-[0-9.]+$/;
/** Mismo criterio que `NUMERIC_RE` pero con el guión adentro: un token sin una
 *  sola letra es un intento de rango, no un nombre DNS. Hace falta aparte
 *  porque el regex RFC 1123 acepta `10.0.0.1--10.0.0.9` (cada label queda
 *  `1--10`, sin guión al principio ni al final) y el cloud también: sin este
 *  corte ese typo se guarda como hostname, el agente nunca lo resuelve y las
 *  254 IPs del rango dejan de barrerse sin que nadie se entere. */
const NUMERIC_DASHED_RE = /^[0-9.-]+$/;
const SEPARATOR_RE = /[\s,;]+/;
/** Viñeta al principio de una línea, con su espacio: un pegado que viene de un
 *  mail o de un doc las trae, y como el guión se colapsa DESPUÉS, sin sacarlas
 *  la lista entera termina en un solo token gigante (`-10.10.7.1-10.10.7.254-10.7.7.1-...`).
 *  Se exige el espacio después de la viñeta para no comerse el `-` de un rango
 *  legítimo pegado al margen. */
const BULLET_RE = /^[ \t]*[-*•–—][ \t]+/gm;
/** Guión largo tipeado o autocorregido: Word/Docs convierten ` - ` en ` – ` solo,
 *  y la propia ficha del portal escribe los rangos con `–` (`subredBarrida`). Sin
 *  normalizarlo, `10.0.0.1 – 10.0.0.254` se parte en dos IPs sueltas más un token
 *  basura: el operador ve "2 válidos" y pierde 252 IPs sin enterarse. Ningún
 *  hostname RFC 1123 lleva estos caracteres, así que no hay ambigüedad. */
const LONG_DASH_RE = /[–—]/g;
const CIDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;

export interface InvalidEntry {
  /** Texto original tal cual lo pegó el operador, para poder mostrárselo. */
  text: string;
  reason: string;
}

export interface ParseRangesResult {
  valid: IpRange[];
  invalid: InvalidEntry[];
  /** Texto original de cada entrada descartada por repetida. */
  duplicates: string[];
  /** IPs DECLARADAS por las entradas válidas (mismo criterio que el tope del
   *  cloud: antes de exclusiones). */
  totalIps: number;
  estimatedLapSeconds: number;
}

interface Bounds { startInt: number; endInt: number }
export type TokenResult = { range: IpRange } | { error: string };

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  return parts.length === 4 && parts.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
}

/** Aritmética con multiplicación, no bitwise con signo (que desborda a
 *  negativo con el primer octeto ≥128) — mismo criterio que el cloud. */
function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
}

/** Normaliza la IP de host a IP de red: `10.0.1.5/24` ≡ `10.0.1.0/24`. */
export function parseCidrBounds(cidr: string): Bounds | null {
  const m = CIDR_RE.exec(cidr.trim());
  if (!m) return null;
  const prefix = Number(m[2]);
  if (!isValidIpv4(m[1]) || prefix > 32) return null;
  const blockSize = 2 ** (32 - prefix);
  const startInt = Math.floor(ipToInt(m[1]) / blockSize) * blockSize;
  return { startInt, endInt: startInt + blockSize - 1 };
}

function boundsOf(range: IpRange): Bounds | null {
  if (range.cidr) return parseCidrBounds(range.cidr);
  const start = range.start?.trim();
  const end = range.end?.trim();
  if (!start || !end || !isValidIpv4(start) || !isValidIpv4(end)) return null;
  const startInt = ipToInt(start);
  const endInt = ipToInt(end);
  return endInt >= startInt ? { startInt, endInt } : null;
}

/** Ausente o `true` = habilitado (retrocompatible: los rangos guardados antes
 *  del campo no tienen `enabled`). `false` = el cloud no lo manda al agente. */
export function isRangeEnabled(range: IpRange): boolean {
  return range.enabled !== false;
}

/**
 * IPs DECLARADAS por una entrada — sin restar exclusiones, igual que el tope
 * del cloud: una exclusión no "compra" espacio extra, el costo lo fija lo
 * declarado. Un hostname cuenta como 1. Una entrada a medio editar cuenta 0.
 */
export function countDeclaredIps(range: IpRange): number {
  if (range.hostname !== undefined) return range.hostname.trim() ? 1 : 0;
  const bounds = boundsOf(range);
  return bounds ? bounds.endInt - bounds.startInt + 1 : 0;
}

export function countTotalDeclaredIps(ranges: IpRange[]): number {
  return ranges.reduce((acc, r) => acc + countDeclaredIps(r), 0);
}

export function estimateLapSeconds(totalIps: number): number {
  return (totalIps / CONCURRENCY) * WORST_CASE_SECONDS_PER_IP;
}

/** Duración legible SIN el `~` (lo pone la copy de cada pantalla). */
export function formatLapDuration(totalIps: number): string {
  const minutes = Math.round(estimateLapSeconds(totalIps) / 60);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Clave de deduplicación. Los rangos y los CIDR se comparan por el INTERVALO
 * que cubren, no por cómo están escritos: `10.0.1.0/24` y
 * `10.0.1.0-10.0.1.255` barren exactamente las mismas IPs, y cargar las dos
 * formas duplica el costo de la vuelta sin descubrir nada nuevo.
 */
function rangeKey(range: IpRange): string | null {
  if (range.hostname !== undefined) {
    const host = range.hostname.trim().toLowerCase();
    return host ? `host:${host}` : null;
  }
  const bounds = boundsOf(range);
  return bounds ? `ip:${bounds.startInt}-${bounds.endInt}` : null;
}

function parseCidrToken(token: string): TokenResult {
  return parseCidrBounds(token)
    ? { range: { cidr: token } }
    : { error: 'CIDR inválido (ej: 10.10.7.0/24)' };
}

function parseRangeToken(token: string): TokenResult {
  const parts = token.split('-');
  if (parts.length !== 2) return { error: 'rango mal formado (esperado inicio-fin)' };
  const [start, end] = parts;
  if (!isValidIpv4(start) || !isValidIpv4(end)) return { error: 'IP inválida (4 octetos de 0 a 255)' };
  if (ipToInt(start) > ipToInt(end)) return { error: 'la IP de inicio es mayor que la de fin' };
  return { range: { start, end } };
}

/** Una IP suelta es un rango de una sola IP (`start` = `end`) — el formato de
 *  alambre hacia el agente no tiene otra forma de expresar un host puntual
 *  numérico. */
function parseSingleIpToken(token: string): TokenResult {
  return isValidIpv4(token)
    ? { range: { start: token, end: token } }
    : { error: 'IP inválida (4 octetos de 0 a 255)' };
}

export function parseToken(token: string): TokenResult {
  if (token.includes('/')) return parseCidrToken(token);
  if (NUMERIC_PAIR_RE.test(token)) return parseRangeToken(token);
  if (NUMERIC_RE.test(token)) return parseSingleIpToken(token);
  if (NUMERIC_DASHED_RE.test(token)) return parseRangeToken(token);
  return HOSTNAME_RE.test(token)
    ? { range: { hostname: token } }
    : { error: 'no es una IP, un CIDR ni un hostname válido' };
}

/**
 * Coma, salto de línea, punto y coma o espacios. El `-` con espacios alrededor
 * se colapsa antes de separar (`10.0.0.1 - 10.0.0.9`): ningún hostname válido
 * tiene un espacio pegado a un guión, así que no hay ambigüedad y se evita
 * romper un pegado prolijo en tres tokens basura. Las viñetas se sacan ANTES
 * del colapso (ver `BULLET_RE`), que si no se las come el guión; el guión largo
 * se normaliza DESPUÉS de las viñetas (`–` al principio de línea es viñeta, en
 * el medio es separador de rango).
 */
export function splitTokens(text: string): string[] {
  return text.replace(BULLET_RE, '').replace(LONG_DASH_RE, '-')
    .replace(/\s*-\s*/g, '-').split(SEPARATOR_RE).filter((t) => t !== '');
}

/**
 * Parsea el texto pegado contra los rangos YA cargados: las entradas repetidas
 * (dentro del pegado o contra la lista existente) salen por `duplicates`, no
 * por `valid`. `valid` se concatena a la lista existente, nunca la reemplaza.
 */
export function parseRanges(text: string, existing: IpRange[] = []): ParseRangesResult {
  const seen = new Set(existing.map(rangeKey).filter((k): k is string => k !== null));
  const valid: IpRange[] = [];
  const invalid: InvalidEntry[] = [];
  const duplicates: string[] = [];

  for (const token of splitTokens(text)) {
    const parsed = parseToken(token);
    if ('error' in parsed) { invalid.push({ text: token, reason: parsed.error }); continue; }
    const key = rangeKey(parsed.range);
    if (key !== null && seen.has(key)) { duplicates.push(token); continue; }
    if (key !== null) seen.add(key);
    valid.push(parsed.range);
  }

  const totalIps = countTotalDeclaredIps(valid);
  return { valid, invalid, duplicates, totalIps, estimatedLapSeconds: estimateLapSeconds(totalIps) };
}

/**
 * Avisos sobre la lista COMPLETA que se va a guardar (los topes del cloud son
 * por agente, no por pegado). Son textos para mostrar, no un bloqueo: el de la
 * vuelta larga es explícitamente no bloqueante en el contrato, y los topes los
 * rechaza el servidor al guardar — acá sólo se anticipan.
 */
export function capWarnings(ranges: IpRange[]): string[] {
  const hostnames = ranges.filter((r) => r.hostname !== undefined).length;
  const specs = ranges.length - hostnames;
  // Los topes los chequea el cloud sobre TODO lo guardado (un rango apagado se
  // valida igual que uno habilitado); la vuelta, en cambio, sólo cuesta lo
  // habilitado, que es lo único que se le manda al agente.
  const declaredIps = countTotalDeclaredIps(ranges);
  const scannedIps = countTotalDeclaredIps(ranges.filter(isRangeEnabled));
  const out: string[] = [];
  if (specs > MAX_SPECS) out.push(`${specs} rangos/CIDR supera el tope de ${MAX_SPECS}: el cloud va a rechazar el guardado.`);
  if (hostnames > MAX_HOSTNAME_SPECS) out.push(`${hostnames} hostnames supera el tope de ${MAX_HOSTNAME_SPECS}: el cloud va a rechazar el guardado.`);
  if (declaredIps > MAX_TOTAL_DECLARED_IPS) out.push(`${declaredIps} IPs declaradas supera el tope de ${MAX_TOTAL_DECLARED_IPS}: el cloud va a rechazar el guardado.`);
  if (estimateLapSeconds(scannedIps) > LAP_WARN_MINUTES * 60) {
    out.push(`La vuelta completa tarda ~${formatLapDuration(scannedIps)}: los equipos de esta lista se releen con esa frecuencia.`);
  }
  return out;
}
