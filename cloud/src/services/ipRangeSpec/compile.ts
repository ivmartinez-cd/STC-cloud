import { logger } from "../../logger";
import { isValidIpv4, ipToInt, intToIp, parseCidr } from "./ip-arithmetic";
import type { CompiledRange, HostSpec, IpRangeSpecInput } from "./types";

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

function resolveBounds(spec: IpRangeSpecInput): { startInt: number; endInt: number; autoExclude: number[] } {
  if (spec.cidr) {
    const parsed = parseCidr(spec.cidr);
    if (!parsed) throw new Error(`cidr inválido: ${spec.cidr}`);
    // Auto-excluye network/broadcast para bloques de 4+ direcciones — /31 y
    // /32 no tienen direcciones reservadas (RFC 3021). No aplica a
    // start/end manual: el admin puso esos límites a propósito.
    const autoExclude = parsed.prefix <= 30 ? [parsed.networkInt, parsed.broadcastInt] : [];
    return { startInt: parsed.networkInt, endInt: parsed.broadcastInt, autoExclude };
  }
  if (spec.start && spec.end) {
    if (!isValidIpv4(spec.start) || !isValidIpv4(spec.end)) throw new Error("start/end inválido");
    const startInt = ipToInt(spec.start);
    const endInt = ipToInt(spec.end);
    if (startInt > endInt) throw new Error("start > end");
    return { startInt, endInt, autoExclude: [] };
  }
  throw new Error("spec sin cidr ni start/end");
}

// Una exclusión fuera del propio rango del spec es un no-op silencioso
// (típicamente un typo), no un error.
function resolveExcludes(spec: IpRangeSpecInput, startInt: number, endInt: number, autoExclude: number[]): Set<number> {
  const excludeInts = new Set<number>(autoExclude);
  for (const ex of spec.exclude ?? []) {
    if (!isValidIpv4(ex)) continue;
    const exInt = ipToInt(ex);
    if (exInt >= startInt && exInt <= endInt) excludeInts.add(exInt);
  }
  return excludeInts;
}

function compileOne(spec: IpRangeSpecInput): CompiledRange[] {
  // Los hostname no compilan a pares {start,end} — el cloud no los resuelve.
  // Van por `extractHostSpecs()` a un campo de heartbeat aparte.
  if (spec.hostname) return [];

  const { startInt, endInt, autoExclude } = resolveBounds(spec);
  const excludeInts = resolveExcludes(spec, startInt, endInt, autoExclude);

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
