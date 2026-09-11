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
    // Un deshabilitado no se compila (`compile.ts`): el agente ni se entera de
    // que existe, así que nunca va a escanear esas IPs. Avisarlo prometería un
    // comportamiento de runtime que no ocurre.
    if (spec.enabled === false) continue;
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

/** Concurrencia real del barrido (`CONCURRENCY_LIMIT` en `ScanService.ts`) y
 *  costo peor-caso de una IP muerta (`checkOpenPorts`). La MISMA fórmula que
 *  usa el portal para mostrar la estimación mientras se edita — si cambia una
 *  punta, cambian las dos, o el operador ve un número y el backend avisa por
 *  otro. */
const SCAN_CONCURRENCY = 10;
const WORST_CASE_SECONDS_PER_IP = 2;
const LONG_LAP_MINUTES = 60;

/** Las deshabilitadas no se compilan (`compile.ts`), así que no cuestan vuelta.
 *  Un spec inválido cuenta 0: acá nunca se rechaza nada, de eso se encarga
 *  `validateIpRangeSpecs()`. */
function declaredIpsOf(spec: IpRangeSpecInput): number {
  if (spec.enabled === false) return 0;
  if (spec.hostname) return 1;
  const bounds = boundsOf(spec);
  return bounds ? bounds.endInt - bounds.startInt + 1 : 0;
}

/**
 * Warning NO bloqueante cuando una vuelta completa de discovery se estira más
 * de `LONG_LAP_MINUTES`. Con el barrido continuo por chunks la vuelta ya no
 * tiene que entrar en el intervalo — regla de SDS ("Monitoring Loops"): si la
 * vuelta tarda más que el intervalo configurado, la siguiente arranca
 * enseguida. O sea que nada se rompe ni se saltea; lo único que pasa es que un
 * equipo nuevo puede tardar hasta una vuelta entera en aparecer, y eso el
 * operador lo tiene que saber ANTES de guardar, no cuando alguien reclama que
 * "la impresora nueva no figura".
 */
export function longLapWarnings(specs: IpRangeSpecInput[]): string[] {
  const totalIps = specs.reduce((acc, spec) => acc + declaredIpsOf(spec), 0);
  const minutes = (totalIps / SCAN_CONCURRENCY) * WORST_CASE_SECONDS_PER_IP / 60;
  if (minutes <= LONG_LAP_MINUTES) return [];
  return [
    `El barrido completo tardaría ~${Math.round(minutes)} min por vuelta (${totalIps} IPs habilitadas, ` +
      `concurrencia ${SCAN_CONCURRENCY}) — se guarda igual y el descubrimiento sigue andando, pero un equipo ` +
      `nuevo puede tardar hasta una vuelta entera en aparecer. Considerá repartir el espacio entre varios ` +
      `agentes o deshabilitar los rangos que no uses.`,
  ];
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
    // Un deshabilitado no se compila, así que nunca se superpone con nada en
    // el barrido: avisarlo sería un falso positivo que el operador no puede
    // hacer desaparecer (justamente acaba de apagar el rango).
    if (spec.enabled === false) return;
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
