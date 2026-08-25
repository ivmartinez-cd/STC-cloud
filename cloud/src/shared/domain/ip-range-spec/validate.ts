import { isValidIpv4, ipToInt, parseCidr } from "./ip-arithmetic";
import { IpRangeValidationError, type IpRangeSpecInput } from "./types";

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

function detectShape(o: Record<string, unknown>, prefix: string) {
  const hasCidr = typeof o.cidr === "string" && o.cidr.trim() !== "";
  const hasRange = typeof o.start === "string" && typeof o.end === "string";
  const hasHostname = typeof o.hostname === "string" && o.hostname.trim() !== "";
  if ([hasCidr, hasRange, hasHostname].filter(Boolean).length !== 1) {
    throw new IpRangeValidationError(`${prefix}: debe tener exactamente uno de "cidr", "start"+"end", o "hostname"`, prefix);
  }
  return { hasCidr, hasHostname };
}

function validateHostname(o: Record<string, unknown>, prefix: string, out: IpRangeSpecInput): number {
  const hostname = (o.hostname as string).trim();
  if (!HOSTNAME_REGEX.test(hostname)) {
    throw new IpRangeValidationError(`${prefix}: hostname inválido`, `${prefix}.hostname`);
  }
  out.hostname = hostname;
  return 1; // un host puntual cuenta como 1 IP declarada
}

function resolveBounds(o: Record<string, unknown>, prefix: string, hasCidr: boolean, out: IpRangeSpecInput) {
  if (hasCidr) {
    const cidr = (o.cidr as string).trim();
    const parsed = parseCidr(cidr);
    if (!parsed) throw new IpRangeValidationError(`${prefix}: cidr inválido`, `${prefix}.cidr`);
    out.cidr = cidr;
    return { startInt: parsed.networkInt, endInt: parsed.broadcastInt };
  }
  const start = (o.start as string).trim();
  const end = (o.end as string).trim();
  if (!isValidIpv4(start)) throw new IpRangeValidationError(`${prefix}: start inválido`, `${prefix}.start`);
  if (!isValidIpv4(end)) throw new IpRangeValidationError(`${prefix}: end inválido`, `${prefix}.end`);
  const startInt = ipToInt(start);
  const endInt = ipToInt(end);
  if (startInt > endInt) throw new IpRangeValidationError(`${prefix}: start debe ser <= end`, `${prefix}.start`);
  out.start = start;
  out.end = end;
  return { startInt, endInt };
}

function validateExclude(o: Record<string, unknown>, prefix: string, out: IpRangeSpecInput): void {
  if (o.exclude === undefined) return;
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

// Tope acumulado sobre el tamaño DECLARADO (antes de exclusiones) — una
// exclusión no "compra" espacio extra, el costo de validar/materializar lo
// fija lo declarado, no lo que sobrevive después de restar.
function validateRangeSpec(o: Record<string, unknown>, prefix: string, hasCidr: boolean, out: IpRangeSpecInput): number {
  const { startInt, endInt } = resolveBounds(o, prefix, hasCidr, out);
  validateExclude(o, prefix, out);
  return endInt - startInt + 1;
}

function validateCredentialIds(o: Record<string, unknown>, prefix: string, out: IpRangeSpecInput): void {
  if (o.credential_ids === undefined) return;
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

function assertWithinTotal(totalDeclared: number, prefix: string): void {
  if (totalDeclared > MAX_TOTAL_DECLARED_IPS) {
    throw new IpRangeValidationError(
      `${prefix}: la suma de IPs declaradas (${totalDeclared}) supera el máximo de ${MAX_TOTAL_DECLARED_IPS} por agente`,
      prefix
    );
  }
}

function extractLabel(o: Record<string, unknown>): string | null {
  return o.label === undefined || o.label === null ? null : String(o.label).slice(0, MAX_LABEL_LEN);
}

function validateOneSpec(item: unknown, i: number, totalDeclaredSoFar: number): { spec: IpRangeSpecInput; declared: number } {
  const prefix = `ip_ranges[${i}]`;
  if (item == null || typeof item !== "object") {
    throw new IpRangeValidationError(`${prefix}: debe ser un objeto`, prefix);
  }
  const o = item as Record<string, unknown>;
  const out: IpRangeSpecInput = { label: extractLabel(o) };

  const { hasCidr, hasHostname } = detectShape(o, prefix);
  const declared = hasHostname ? validateHostname(o, prefix, out) : validateRangeSpec(o, prefix, hasCidr, out);

  assertWithinTotal(totalDeclaredSoFar + declared, prefix);
  validateCredentialIds(o, prefix, out);
  return { spec: out, declared };
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
    const { spec, declared } = validateOneSpec(item, i, totalDeclared);
    totalDeclared += declared;
    return spec;
  });
}
