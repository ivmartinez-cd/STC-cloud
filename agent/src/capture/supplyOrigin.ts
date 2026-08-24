/**
 * Fase 10 del gap analysis vs HP SDS — detección de consumible no original.
 * Un solo clasificador multilingüe (en/es/pt) por regex, reusado desde las
 * fuentes que ya traen texto libre de estado/descripción del consumible:
 * `generic-printer-mib.ts` (prtMarkerSuppliesDescription, RFC 3805 —
 * universal multimarca, la fuente con más cobertura real), `hp-futuresmart.ts`
 * (SupplyState del EWS) y `ews-parsers/hp.ts` (ConsumableLifeState/
 * SupplyAuthenticationState). Lexmark/Samsung quedan best-effort (mismas
 * regex, sin garantía de que esos EWS expongan el texto) — nunca `'genuine'`
 * por defecto: sin señal clara, `undefined` (no se inventa un veredicto).
 */
export type SupplyOrigin = 'genuine' | 'non_genuine';

// Brand-agnostic a propósito (`generic-printer-mib.ts`, la fuente principal,
// es multimarca por SNMP — HP, Samsung, Brother, Lexmark, etc. pueden llegar
// acá): "non-HP" es el caso literal más común en la práctica, pero también
// se cubren frases sin marca ("non-genuine", "not genuine", "no original").
// Se evalúa non-genuine ANTES que genuine: una frase larga tipo "Cartucho
// genuino detectado como no original" (traducción rara pero posible) debe
// ganar el negativo, el caso más importante de no perder.
const NON_GENUINE_RX = /non-?\s*hp\b|non-?genuine|not\s+genuine|no(?:n)?\s+original|não\s+original|remanufactur|used\s+or\s+counterfeit|counterfeit|compat[ií]v?el|compatible|clon(?:e|ado)?|refill(?:ed|ado)?/i;
const GENUINE_RX = /\bgenuine\b|\boriginal\b|autentic/i;

/** `null` = sin señal (no hay texto, o el texto no dice nada sobre origen). */
export function classifySupplyOrigin(text: string | null | undefined): SupplyOrigin | null {
  if (!text) return null;
  if (NON_GENUINE_RX.test(text)) return 'non_genuine';
  if (GENUINE_RX.test(text)) return 'genuine';
  return null;
}

/** Roll-up de los 4 tóners de un `SuppliesReading.toners` — peor caso gana:
 *  un solo cartucho no original alcanza para marcar el equipo entero. */
export function worstSupplyOrigin(origins: Array<SupplyOrigin | null | undefined>): SupplyOrigin | null {
  if (origins.includes('non_genuine')) return 'non_genuine';
  if (origins.includes('genuine')) return 'genuine';
  return null;
}
