/**
 * Rangos de IP a escanear por agente (§2.1/§2.3 gap analysis: CIDR + tope de
 * tamaño + exclusiones). Lógica pura — sin Knex, sin Fastify — mismo estilo
 * que `snmpCredentials.ts`.
 *
 * Se guarda en `agents.ip_ranges` (jsonb libre, sin migración de columna) un
 * "spec" por entrada: `{start,end}` (rango manual) o `{cidr}` (bloque CIDR),
 * ambos con un `exclude?: string[]` opcional de IPs individuales a saltear.
 * El agente NUNCA ve CIDR ni exclusiones — `compileIpRangeSpecs()` expande
 * todo a una lista plana de pares `{start,end}`, el mismo formato de
 * alambre que el agente ya entiende hoy (cero cambios de parsing ahí, cero
 * riesgo de romper agentes viejos).
 */

export interface IpRangeSpecInput {
  label?: string | null;
  start?: string;
  end?: string;
  cidr?: string;
  exclude?: string[];
}

export interface CompiledRange {
  start: string;
  end: string;
}

export class IpRangeValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

const MAX_SPECS = 20;
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
 * a pares planos (eso es `compileIpRangeSpecs`, sólo en el path del
 * heartbeat).
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
    if (hasCidr === hasRange) {
      throw new IpRangeValidationError(`${prefix}: debe tener exactamente uno de "cidr" o "start"+"end"`, prefix);
    }

    let startInt: number;
    let endInt: number;
    const out: IpRangeSpecInput = { label };

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
    if (totalDeclared > MAX_TOTAL_DECLARED_IPS) {
      throw new IpRangeValidationError(
        `${prefix}: la suma de IPs declaradas (${totalDeclared}) supera el máximo de ${MAX_TOTAL_DECLARED_IPS} por agente`,
        prefix
      );
    }

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

  return subtractPoints(startInt, endInt, excludeInts).map(([s, e]) => ({ start: intToIp(s), end: intToIp(e) }));
}

/**
 * Compila specs (CIDR/exclusiones incluidos) a una lista plana de pares
 * `{start,end}` — lo que el agente recibe en el heartbeat. TOLERANTE a un
 * spec individual corrupto (se salta y se loguea, nunca tira abajo el
 * resto ni propaga): el heartbeat no puede romperse por un dato malo, mismo
 * criterio que `toWire()` en `snmpCredentials.ts`.
 */
export function compileIpRangeSpecs(specs: IpRangeSpecInput[]): CompiledRange[] {
  const out: CompiledRange[] = [];
  for (const spec of specs) {
    try {
      out.push(...compileOne(spec));
    } catch (err) {
      console.error(`[ipRangeSpec] No se pudo compilar el rango (label=${spec.label ?? "-"}), se omite:`, err);
    }
  }
  return out;
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
