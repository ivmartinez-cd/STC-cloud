import { isValidIpv4, ipToInt, isPrivateOrReserved, parseCidr } from "./ip-arithmetic";
import type { IpRangeSpecInput } from "./types";

function boundsOf(spec: IpRangeSpecInput): { startInt: number; endInt: number } | null {
  if (spec.cidr) {
    const parsed = parseCidr(spec.cidr);
    return parsed ? { startInt: parsed.networkInt, endInt: parsed.broadcastInt } : null;
  }
  if (spec.start && spec.end && isValidIpv4(spec.start) && isValidIpv4(spec.end)) {
    return { startInt: ipToInt(spec.start), endInt: ipToInt(spec.end) };
  }
  return null;
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
    const bounds = boundsOf(spec);
    if (!bounds) continue;
    if (!isPrivateOrReserved(bounds.startInt) || !isPrivateOrReserved(bounds.endInt)) {
      const label = spec.label ? ` "${spec.label}"` : "";
      const desc = spec.cidr ?? `${spec.start}-${spec.end}`;
      warnings.push(`El rango${label} (${desc}) incluye direcciones IP públicas — revisá que no sea un error de tipeo.`);
    }
  }
  return warnings;
}

interface CredentialRange {
  startInt: number;
  endInt: number;
  label: string | null;
  credKey: string;
  index: number;
}

function toCredentialRanges(specs: IpRangeSpecInput[]): CredentialRange[] {
  const ranges: CredentialRange[] = [];
  specs.forEach((spec, index) => {
    const bounds = boundsOf(spec);
    if (!bounds) return; // hostname o inválido — no aplica a esta heurística
    const credKey = spec.credential_ids ? [...spec.credential_ids].sort().join(",") : "";
    ranges.push({ ...bounds, label: spec.label ?? null, credKey, index });
  });
  return ranges;
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
  const ranges = toCredentialRanges(specs);
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
