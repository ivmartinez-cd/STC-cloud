/**
 * Rangos de IP a escanear por agente (§2.1/§2.3 gap analysis: CIDR + tope de
 * tamaño + exclusiones + hostname + credenciales por rango). Lógica pura —
 * sin Knex, sin Fastify — mismo estilo que `snmpCredentials.ts`.
 *
 * Se guarda en `agents.ip_ranges` (jsonb libre, sin migración de columna) un
 * "spec" por entrada: `{start,end}` (rango manual), `{cidr}` (bloque CIDR) o
 * `{hostname}` (point lookup — el cloud NO resuelve, no tiene visibilidad de
 * la DNS interna del cliente; el agente resuelve en cada ciclo de discovery,
 * ver `ScanService.scan()`). Los dos primeros admiten `exclude?: string[]`
 * (IPs individuales a saltear); ninguno admite `exclude` junto a `hostname`
 * (no aplica a un host puntual). Cualquiera de los tres admite
 * `credential_ids?: string[]` — referencia a `id`s de `agents.snmp_credentials`
 * (la lista existente, nunca se duplica material de credencial) para
 * restringir qué credenciales prueba el agente en ESE rango durante
 * discovery (ver `agentService.getConfig()` para la resolución fail-open de
 * ids colgantes).
 *
 * El agente NUNCA ve CIDR ni exclusiones ni hostname sin resolver —
 * `compileIpRangeSpecs()` expande todo a una lista plana de pares
 * `{start,end}`, el mismo formato de alambre que el agente ya entiende hoy
 * (cero cambios de parsing ahí, cero riesgo de romper agentes viejos);
 * `extractHostSpecs()` separa las entradas de hostname a un campo de
 * heartbeat nuevo y aditivo (`ip_hosts`) que agentes viejos simplemente
 * ignoran.
 */

import { logger } from "../logger";

export interface IpRangeSpecInput {
  label?: string | null;
  start?: string;
  end?: string;
  cidr?: string;
  hostname?: string;
  exclude?: string[];
  credential_ids?: string[];
}

export interface CompiledRange {
  start: string;
  end: string;
  credential_ids?: string[];
}

export interface HostSpec {
  hostname: string;
  label: string | null;
  credential_ids?: string[];
}

export class IpRangeValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

/**
 * Subió de 20 a 32 al agregar hostname: comparte el mismo pool que
 * rangos/CIDR (un solo editor, un solo tope) y un cliente que ya usa varios
 * rangos de descubrimiento masivo puede querer pinear varios hosts puntuales
 * además — no vale la complejidad de un tope separado, sólo dar más margen.
 */
const MAX_SPECS = 32;
/**
 * Con CONCURRENCY_LIMIT=10 (ScanService.ts) y ~2000ms de costo peor-caso por
 * host muerto (checkOpenPorts), 2000 IPs ≈ (2000/10)×2s ≈ 400s (~6.7 min) de
 * discovery peor caso — margen cómodo bajo el intervalo de 10 min en horario
 * laboral (BusinessHours.ts). El gap analysis sugiere "≤4096" a modo de
 * ejemplo, pero esa cifra ronda los ~14 min y hambrea meter/supplies (el
 * scheduler evalúa discovery antes que los otros loops).
 */
const MAX_TOTAL_DECLARED_IPS = 2000;
const MAX_EXCLUDES_PER_SPEC = 32;
const MAX_LABEL_LEN = 100;
/** Mismo `MAX_CREDENTIALS` que `snmpCredentials.ts` — no tiene sentido
 *  referenciar más ids de los que un agente puede tener guardados. */
const MAX_CREDENTIAL_IDS_PER_SPEC = 8;
/** Hostname DNS razonable (RFC 1123, con al menos 1 label — admite un
 *  nombre corto sin dominio, resoluble vía DNS/mDNS local). No es
 *  validación exhaustiva, sólo descarta basura obvia. */
const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

function isValidOctet(s: string): boolean {
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return n >= 0 && n <= 255;
}

function isValidIpv4(ip: string): boolean {
  if (typeof ip !== "string") return false;
  const parts = ip.split(".");
  return parts.length === 4 && parts.every(isValidOctet);
}

/** Aritmética segura (multiplicación, no bitwise con signo) — a diferencia
 *  de `agent/src/core/NetworkUtils.ts:toN()`, que desborda a negativo para
 *  IPs con primer octeto ≥128 (bug latente preexistente, no se toca acá). */
function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

interface ParsedCidr {
  networkInt: number;
  broadcastInt: number;
  prefix: number;
}

/** Normaliza una IP de host dentro del bloque a la IP de red (ej.
 *  `192.168.1.5/24` se trata como `192.168.1.0/24`). */
function parseCidr(cidr: string): ParsedCidr | null {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!m) return null;
  const [, ip, prefixStr] = m;
  if (!isValidIpv4(ip)) return null;
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const hostBits = 32 - prefix;
  const blockSize = 2 ** hostBits;
  const networkInt = Math.floor(ipToInt(ip) / blockSize) * blockSize;
  const broadcastInt = networkInt + blockSize - 1;
  return { networkInt, broadcastInt, prefix };
}

/**
 * Valida el body de `ip_ranges` (PUT config / POST alta de monitor) contra
 * las reglas de forma y los topes de tamaño. Lanza `IpRangeValidationError`
 * con `field` para que el portal pinte el campo puntual — no resuelve CIDR
 * ni hostname (eso es `compileIpRangeSpecs()`/`extractHostSpecs()`, sólo en
 * el path del heartbeat), y NO valida que `credential_ids` referencien
 * credenciales existentes (endpoint distinto, sin transacción compartida —
 * se resuelve con gracia en `agentService.getConfig()`).
 */
export function validateIpRangeSpecs(raw: unknown): IpRangeSpecInput[] {
  if (!Array.isArray(raw)) throw new IpRangeValidationError("ip_ranges debe ser un array");
  if (raw.length > MAX_SPECS) {
    throw new IpRangeValidationError(`Máximo ${MAX_SPECS} rangos por agente`, "ip_ranges");
  }

  let totalDeclared = 0;

  return raw.map((item, i) => {
    const prefix = `ip_ranges[${i}]`;
    if (item == null || typeof item !== "object") {
      throw new IpRangeValidationError(`${prefix}: debe ser un objeto`, prefix);
    }
    const o = item as Record<string, unknown>;
    const label = o.label === undefined || o.label === null ? null : String(o.label).slice(0, MAX_LABEL_LEN);

    const hasCidr = typeof o.cidr === "string" && o.cidr.trim() !== "";
    const hasRange = typeof o.start === "string" && typeof o.end === "string";
    const hasHostname = typeof o.hostname === "string" && o.hostname.trim() !== "";
    if ([hasCidr, hasRange, hasHostname].filter(Boolean).length !== 1) {
      throw new IpRangeValidationError(`${prefix}: debe tener exactamente uno de "cidr", "start"+"end", o "hostname"`, prefix);
    }

    const out: IpRangeSpecInput = { label };

    if (hasHostname) {
      const hostname = (o.hostname as string).trim();
      if (!HOSTNAME_REGEX.test(hostname)) {
        throw new IpRangeValidationError(`${prefix}: hostname inválido`, `${prefix}.hostname`);
      }
      out.hostname = hostname;
      totalDeclared += 1; // un host puntual cuenta como 1 IP declarada
    } else {
      let startInt: number;
      let endInt: number;

      if (hasCidr) {
        const cidr = (o.cidr as string).trim();
        const parsed = parseCidr(cidr);
        if (!parsed) throw new IpRangeValidationError(`${prefix}: cidr inválido`, `${prefix}.cidr`);
        startInt = parsed.networkInt;
        endInt = parsed.broadcastInt;
        out.cidr = cidr;
      } else {
        const start = (o.start as string).trim();
        const end = (o.end as string).trim();
        if (!isValidIpv4(start)) throw new IpRangeValidationError(`${prefix}: start inválido`, `${prefix}.start`);
        if (!isValidIpv4(end)) throw new IpRangeValidationError(`${prefix}: end inválido`, `${prefix}.end`);
        startInt = ipToInt(start);
        endInt = ipToInt(end);
        if (startInt > endInt) throw new IpRangeValidationError(`${prefix}: start debe ser <= end`, `${prefix}.start`);
        out.start = start;
        out.end = end;
      }

      // Tope acumulado sobre el tamaño DECLARADO (antes de exclusiones) — una
      // exclusión no "compra" espacio extra, el costo de validar/materializar
      // lo fija lo declarado, no lo que sobrevive después de restar.
      totalDeclared += endInt - startInt + 1;

      if (o.exclude !== undefined) {
        if (!Array.isArray(o.exclude)) throw new IpRangeValidationError(`${prefix}: exclude debe ser un array`, `${prefix}.exclude`);
        if (o.exclude.length > MAX_EXCLUDES_PER_SPEC) {
          throw new IpRangeValidationError(`${prefix}: máximo ${MAX_EXCLUDES_PER_SPEC} exclusiones`, `${prefix}.exclude`);
        }
        const excludes = o.exclude.map((e: unknown, j: number) => {
          if (typeof e !== "string" || !isValidIpv4(e.trim())) {
            throw new IpRangeValidationError(`${prefix}.exclude[${j}]: IP inválida`, `${prefix}.exclude`);
          }
          return e.trim();
        });
        if (excludes.length > 0) out.exclude = excludes;
      }
    }

    if (totalDeclared > MAX_TOTAL_DECLARED_IPS) {
      throw new IpRangeValidationError(
        `${prefix}: la suma de IPs declaradas (${totalDeclared}) supera el máximo de ${MAX_TOTAL_DECLARED_IPS} por agente`,
        prefix
      );
    }

    if (o.credential_ids !== undefined) {
      if (!Array.isArray(o.credential_ids)) {
        throw new IpRangeValidationError(`${prefix}: credential_ids debe ser un array`, `${prefix}.credential_ids`);
      }
      if (o.credential_ids.length > MAX_CREDENTIAL_IDS_PER_SPEC) {
        throw new IpRangeValidationError(`${prefix}: máximo ${MAX_CREDENTIAL_IDS_PER_SPEC} credential_ids`, `${prefix}.credential_ids`);
      }
      const ids = [...new Set(o.credential_ids.map((id: unknown, j: number) => {
        if (typeof id !== "string" || !id.trim()) {
          throw new IpRangeValidationError(`${prefix}.credential_ids[${j}]: debe ser un string no vacío`, `${prefix}.credential_ids`);
        }
        return id.trim();
      }))];
      if (ids.length > 0) out.credential_ids = ids;
    }

    return out;
  });
}

/** Resta puntos individuales de `[startInt,endInt]`, partiendo en sub-rangos
 *  contiguos. `excludePoints` ya viene filtrado a los que caen dentro del
 *  intervalo. Cubre excluir el primer/último IP, todo el rango (devuelve
 *  vacío, nunca un `start>end`), y duplicados. */
function subtractPoints(startInt: number, endInt: number, excludePoints: Set<number>): Array<[number, number]> {
  const sorted = [...excludePoints].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let cursor = startInt;
  for (const p of sorted) {
    if (p > cursor) out.push([cursor, p - 1]);
    cursor = p + 1;
    if (cursor > endInt) break;
  }
  if (cursor <= endInt) out.push([cursor, endInt]);
  return out;
}

function compileOne(spec: IpRangeSpecInput): CompiledRange[] {
  // Los hostname no compilan a pares {start,end} — el cloud no los resuelve.
  // Van por `extractHostSpecs()` a un campo de heartbeat aparte.
  if (spec.hostname) return [];

  let startInt: number;
  let endInt: number;
  let autoExclude: number[] = [];

  if (spec.cidr) {
    const parsed = parseCidr(spec.cidr);
    if (!parsed) throw new Error(`cidr inválido: ${spec.cidr}`);
    startInt = parsed.networkInt;
    endInt = parsed.broadcastInt;
    // Auto-excluye network/broadcast para bloques de 4+ direcciones — /31 y
    // /32 no tienen direcciones reservadas (RFC 3021). No aplica a
    // start/end manual: el admin puso esos límites a propósito.
    if (parsed.prefix <= 30) autoExclude = [parsed.networkInt, parsed.broadcastInt];
  } else if (spec.start && spec.end) {
    if (!isValidIpv4(spec.start) || !isValidIpv4(spec.end)) throw new Error("start/end inválido");
    startInt = ipToInt(spec.start);
    endInt = ipToInt(spec.end);
    if (startInt > endInt) throw new Error("start > end");
  } else {
    throw new Error("spec sin cidr ni start/end");
  }

  const excludeInts = new Set<number>(autoExclude);
  for (const ex of spec.exclude ?? []) {
    if (isValidIpv4(ex)) {
      const exInt = ipToInt(ex);
      // Una exclusión fuera del propio rango del spec es un no-op
      // silencioso (típicamente un typo), no un error.
      if (exInt >= startInt && exInt <= endInt) excludeInts.add(exInt);
    }
  }

  return subtractPoints(startInt, endInt, excludeInts).map(([s, e]) => ({
    start: intToIp(s),
    end: intToIp(e),
    ...(spec.credential_ids ? { credential_ids: spec.credential_ids } : {}),
  }));
}

/**
 * Compila specs (CIDR/exclusiones incluidos) a una lista plana de pares
 * `{start,end}` — lo que el agente recibe en el heartbeat. TOLERANTE a un
 * spec individual corrupto (se salta y se loguea, nunca tira abajo el
 * resto ni propaga): el heartbeat no puede romperse por un dato malo, mismo
 * criterio que `toWire()` en `snmpCredentials.ts`. Las entradas de hostname
 * se saltan silenciosamente acá (sin log de error — no son un dato corrupto,
 * ver `extractHostSpecs()`).
 */
export function compileIpRangeSpecs(specs: IpRangeSpecInput[]): CompiledRange[] {
  const out: CompiledRange[] = [];
  for (const spec of specs) {
    if (spec.hostname) continue;
    try {
      out.push(...compileOne(spec));
    } catch (err) {
      logger.error({ err }, `[ipRangeSpec] No se pudo compilar el rango (label=${spec.label ?? "-"}), se omite`);
    }
  }
  return out;
}

/**
 * Extrae las entradas de tipo hostname — el agente las resuelve él mismo en
 * cada ciclo de discovery (DNS interno del cliente, el cloud no tiene
 * visibilidad). Viaja en un campo de heartbeat NUEVO y aditivo (`ip_hosts`)
 * — agentes viejos que nunca vieron este campo simplemente lo ignoran.
 */
export function extractHostSpecs(specs: IpRangeSpecInput[]): HostSpec[] {
  return specs
    .filter((s): s is IpRangeSpecInput & { hostname: string } => !!s.hostname)
    .map((s) => ({
      hostname: s.hostname,
      label: s.label ?? null,
      ...(s.credential_ids ? { credential_ids: s.credential_ids } : {}),
    }));
}

const PRIVATE_BLOCKS: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")], // loopback
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")], // link-local
];

function isPrivateOrReserved(ipInt: number): boolean {
  return PRIVATE_BLOCKS.some(([s, e]) => ipInt >= s && ipInt <= e);
}

/**
 * Warnings NO bloqueantes (nunca rechazan el guardado) para specs con IPs
 * fuera de RFC1918/loopback/link-local. El modelo de amenaza real no es un
 * ataque (sólo staff interno puede escribir `ip_ranges`, ver `rolePolicy.ts`)
 * sino un operador de STC que fat-fingerea un CIDR y el agente termina
 * escaneando IPs públicas de internet (abuso operacional/reputacional).
 * Heurística barata: sólo chequea los dos extremos del rango, no cada IP.
 * Las entradas de hostname se saltan (el cloud no puede resolver para saber
 * si la IP resultante sería pública — el agente sí lo chequea, ver
 * `ScanService.scan()`).
 */
export function publicIpWarnings(specs: IpRangeSpecInput[]): string[] {
  const warnings: string[] = [];
  for (const spec of specs) {
    let startInt: number;
    let endInt: number;
    if (spec.cidr) {
      const parsed = parseCidr(spec.cidr);
      if (!parsed) continue;
      startInt = parsed.networkInt;
      endInt = parsed.broadcastInt;
    } else if (spec.start && spec.end && isValidIpv4(spec.start) && isValidIpv4(spec.end)) {
      startInt = ipToInt(spec.start);
      endInt = ipToInt(spec.end);
    } else {
      continue;
    }
    if (!isPrivateOrReserved(startInt) || !isPrivateOrReserved(endInt)) {
      const label = spec.label ? ` "${spec.label}"` : "";
      const desc = spec.cidr ?? `${spec.start}-${spec.end}`;
      warnings.push(`El rango${label} (${desc}) incluye direcciones IP públicas — revisá que no sea un error de tipeo.`);
    }
  }
  return warnings;
}

/**
 * Warning NO bloqueante para specs cuyos rangos compilados se superponen Y
 * declaran `credential_ids` distintos. `ScanService.scan()` (agente) procesa
 * cada spec secuencialmente con su propio pool de workers — una IP dentro de
 * la superposición se captura DOS VECES en el mismo ciclo, con la credencial
 * del ÚLTIMO spec ganando (`COALESCE` en `known_devices.snmp_cred_id`) y dos
 * lecturas encoladas para el mismo dispositivo. No se resuelve en runtime
 * (no vale la complejidad de una regla de precedencia explícita), sólo se
 * avisa al guardar.
 */
export function overlappingCredentialWarnings(specs: IpRangeSpecInput[]): string[] {
  interface Range { startInt: number; endInt: number; label: string | null; credKey: string; index: number; }
  const ranges: Range[] = [];

  specs.forEach((spec, i) => {
    let startInt: number;
    let endInt: number;
    if (spec.cidr) {
      const parsed = parseCidr(spec.cidr);
      if (!parsed) return;
      startInt = parsed.networkInt;
      endInt = parsed.broadcastInt;
    } else if (spec.start && spec.end && isValidIpv4(spec.start) && isValidIpv4(spec.end)) {
      startInt = ipToInt(spec.start);
      endInt = ipToInt(spec.end);
    } else {
      return; // hostname o inválido — no aplica a esta heurística
    }
    const credKey = spec.credential_ids ? [...spec.credential_ids].sort().join(",") : "";
    ranges.push({ startInt, endInt, label: spec.label ?? null, credKey, index: i });
  });

  const warnings: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      const overlaps = a.startInt <= b.endInt && b.startInt <= a.endInt;
      if (overlaps && a.credKey !== b.credKey) {
        const aDesc = a.label ? `"${a.label}"` : `ip_ranges[${a.index}]`;
        const bDesc = b.label ? `"${b.label}"` : `ip_ranges[${b.index}]`;
        warnings.push(
          `Los rangos ${aDesc} y ${bDesc} se superponen con credenciales SNMP distintas — el resultado no es determinístico para las IPs en común (gana el último de la lista).`
        );
      }
    }
  }
  return warnings;
}
