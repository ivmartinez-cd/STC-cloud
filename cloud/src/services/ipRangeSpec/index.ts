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
 *
 * Dividido en Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md (era un solo
 * archivo de 436 líneas) en: types (interfaces + error), ip-arithmetic
 * (aritmética IPv4/CIDR pura), validate (PUT config), compile (heartbeat) y
 * warnings (heurísticas no bloqueantes al guardar). Este archivo es sólo el
 * punto de entrada — reexporta todo, ningún import externo cambia.
 */

export type { IpRangeSpecInput, CompiledRange, HostSpec } from "./types";
export { IpRangeValidationError } from "./types";
export { validateIpRangeSpecs } from "./validate";
export { compileIpRangeSpecs, extractHostSpecs } from "./compile";
export { publicIpWarnings, overlappingCredentialWarnings } from "./warnings";
