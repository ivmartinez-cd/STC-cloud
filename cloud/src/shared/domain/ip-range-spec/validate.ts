import { isValidIpv4, ipToInt, parseCidr } from "./ip-arithmetic";
import { IpRangeValidationError, type IpRangeSpecInput } from "./types";

/**
 * Pool de entradas de rango/CIDR. Una entrada extra cuesta una fila más en el
 * jsonb, no tiempo de barrido (lo que cuesta son las IPs, y eso lo tapa
 * `MAX_TOTAL_DECLARED_IPS`), así que el tope sólo tiene que dejar entrar la
 * topología real: el caso que lo motivó es un cliente con 59 sedes, un /24 por
 * sede. 256 da ese margen con lugar para crecer.
 */
const MAX_SPECS = 256;
/**
 * Pool SEPARADO del de rangos: un hostname no es "1 IP más", es una
 * resolución DNS SECUENCIAL con timeout de 4s del lado agente
 * (`ScanService.resolveHost()` + `DNS_LOOKUP_TIMEOUT_MS`), así que 32 nombres
 * con la DNS caída ya son ~2 min de vuelta por sí solos. Modelo de costo
 * distinto, tope distinto — y el agente documenta explícitamente que su peor
 * caso es `32 × timeout` porque el cloud lo acota acá: subir este número
 * sin tocar el agente le alarga la vuelta en frío.
 */
const MAX_HOSTNAME_SPECS = 32;
/**
 * Un /16. Ya NO sale de "cuánto entra en el ciclo": con el barrido continuo
 * por chunks con cursor, una vuelta se recorre en varias pasadas y el
 * intervalo (10/60 min) sólo gatea el ARRANQUE DE UNA VUELTA NUEVA, nunca
 * corta la que está en curso — regla de SDS, white paper "Monitoring Loops":
 * "If it takes longer than the configured time for a monitoring loop to get
 * through the list of all devices being monitored then the next run of that
 * loop commences immediately". O sea que un espacio grande ya no rompe nada,
 * sólo tarda: lo que este tope ataja es el error de carga (el /8 tipeado de
 * más), no la duración. La duración se avisa aparte y sin bloquear, ver
 * `longLapWarnings()` en `warnings.ts`.
 */
const MAX_TOTAL_DECLARED_IPS = 65536;
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

// Ausente = habilitado: toda la config que ya está guardada no tiene el campo
// y tiene que seguir significando "escanealo".
function validateEnabled(o: Record<string, unknown>, prefix: string, out: IpRangeSpecInput): void {
  if (o.enabled === undefined) return;
  if (typeof o.enabled !== "boolean") {
    throw new IpRangeValidationError(`${prefix}: enabled debe ser true o false`, `${prefix}.enabled`);
  }
  out.enabled = o.enabled;
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

interface SpecTally {
  ranges: number;
  hostnames: number;
  declaredIps: number;
}

function validateOneSpec(item: unknown, i: number, totalDeclaredSoFar: number): { spec: IpRangeSpecInput; declared: number; isHostname: boolean } {
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
  validateEnabled(o, prefix, out);
  return { spec: out, declared, isHostname: hasHostname };
}

// Dos pools independientes: 256 rangos y 32 hostnames conviven sin competir.
// Se chequea a medida que se cuenta (no al final) para que el error salga en
// la primera entrada que desborda, igual que el tope de IPs declaradas.
function assertWithinPools(tally: SpecTally): void {
  if (tally.ranges > MAX_SPECS) {
    throw new IpRangeValidationError(`Máximo ${MAX_SPECS} rangos (IP o CIDR) por agente`, "ip_ranges");
  }
  if (tally.hostnames > MAX_HOSTNAME_SPECS) {
    throw new IpRangeValidationError(`Máximo ${MAX_HOSTNAME_SPECS} hostnames por agente`, "ip_ranges");
  }
}

/**
 * Valida el body de `ip_ranges` (PUT config / POST alta de monitor) contra
 * las reglas de forma y los topes de tamaño. Lanza `IpRangeValidationError`
 * con `field` para que el portal pinte el campo puntual — no resuelve CIDR
 * ni hostname (eso es `compileIpRangeSpecs()`/`extractHostSpecs()`, sólo en
 * el path del heartbeat), y NO valida que `credential_ids` referencien
 * credenciales existentes (endpoint distinto, sin transacción compartida —
 * se resuelve con gracia en `agentService.getConfig()`).
 *
 * Un rango con `enabled: false` se valida igual que uno habilitado (queda
 * guardado y tiene que poder re-habilitarse sin volver a editarlo) y cuenta
 * para los topes: son topes de tamaño de CONFIG, no de barrido. Lo que no
 * cuesta es tiempo de vuelta, y eso lo mide `longLapWarnings()`.
 */
export function validateIpRangeSpecs(raw: unknown): IpRangeSpecInput[] {
  if (!Array.isArray(raw)) throw new IpRangeValidationError("ip_ranges debe ser un array");
  // Corte barato antes de recorrer: ni con los dos pools llenos entra.
  if (raw.length > MAX_SPECS + MAX_HOSTNAME_SPECS) {
    throw new IpRangeValidationError(
      `Máximo ${MAX_SPECS} rangos y ${MAX_HOSTNAME_SPECS} hostnames por agente`,
      "ip_ranges"
    );
  }

  const tally: SpecTally = { ranges: 0, hostnames: 0, declaredIps: 0 };
  return raw.map((item, i) => {
    const { spec, declared, isHostname } = validateOneSpec(item, i, tally.declaredIps);
    if (isHostname) tally.hostnames += 1;
    else tally.ranges += 1;
    tally.declaredIps += declared;
    assertWithinPools(tally);
    return spec;
  });
}
