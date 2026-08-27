import type { SupplyUrgency } from "../entities/supply-row";

/** Umbrales del handoff hifi #3 (26/08/2026) — antes 10%/20%, alineados acá a
 * 15%/35% para que coincidan con la tira de métricas y la barra de NIVEL
 * RESTANTE de la pantalla de Consumibles. Único lugar donde viven: la vista
 * de Consumibles y su resumen los consumen de acá, nunca los redefinen. */
export const CRITICAL_PCT = 15;
export const LOW_PCT = 35;

export function urgencyOf(pct: number | null): SupplyUrgency {
  if (pct == null) return "sin_lectura";
  if (pct <= CRITICAL_PCT) return "critico";
  if (pct <= LOW_PCT) return "bajo";
  return "normal";
}
