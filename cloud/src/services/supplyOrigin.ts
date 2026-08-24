/**
 * Fase 10 del gap analysis vs HP SDS — detección de consumible no original.
 * El agente 1.1.0+ manda `reading.supply_origin` ya calculado (roll-up
 * peor-caso de los 4 tóners, ver `agent/src/capture/normalize.ts`). Este
 * módulo es el fallback server-side para agentes viejos que sólo mandan
 * `supplies_details` crudo (o para el caso raro de un agente 1.1.0 en un
 * dispositivo con un `origin` presente sólo en algún tóner que el roll-up
 * del agente no vio por algún bug futuro) — deriva del mismo jsonb con el
 * mismo criterio "peor caso gana, null nunca 'genuine'".
 */

type SupplyOrigin = "genuine" | "non_genuine";

function originOf(item: unknown): SupplyOrigin | null {
  if (!item || typeof item !== "object") return null;
  const o = (item as { origin?: unknown }).origin;
  return o === "genuine" || o === "non_genuine" ? o : null;
}

/** `raw` = `reading.supplies_details` (objeto o string JSON, tal como llega del agente). */
export function deriveSupplyOriginFromDetails(raw: unknown): SupplyOrigin | null {
  try {
    const details = typeof raw === "string" ? JSON.parse(raw) : raw;
    const toners = (details as { toners?: Record<string, unknown> } | null)?.toners;
    if (!toners) return null;
    const origins = Object.values(toners).map(originOf);
    if (origins.includes("non_genuine")) return "non_genuine";
    if (origins.includes("genuine")) return "genuine";
    return null;
  } catch {
    return null;
  }
}

/** `explicit` = `reading.supply_origin` tal como lo manda el agente (puede ser undefined en agentes viejos). */
export function resolveSupplyOrigin(explicit: unknown, suppliesDetailsRaw: unknown): SupplyOrigin | null {
  if (explicit === "genuine" || explicit === "non_genuine") return explicit;
  return deriveSupplyOriginFromDetails(suppliesDetailsRaw);
}
