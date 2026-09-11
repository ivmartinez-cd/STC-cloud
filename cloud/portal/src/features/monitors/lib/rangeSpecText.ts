import type { IpRange } from '../../../shared/types/agents';
import { countTotalDeclaredIps, formatLapDuration, isRangeEnabled, parseToken, splitTokens, type TokenResult } from './parseRanges';

/**
 * Edición fila por fila de `ip_ranges` (`IpRangeRow` / `IpRangesEditor`) y
 * resumen de la lista — lógica PURA sobre `parseRanges.ts`, separada para que
 * ese módulo (el espejo del contrato del cloud) no crezca con cosas de UI.
 * Sin React, sin DOM, sin red: se testea en Node junto con `parseRanges`.
 */

/**
 * UNA entrada tipeada a mano en la fila del editor (`IpRangeRow`): misma
 * normalización que el pegado (`splitTokens` colapsa ` - `, guión largo y
 * viñetas) y mismo `parseToken`, así lo que se acepta a mano y lo que se
 * acepta pegado es exactamente lo mismo. Dos tokens en una fila es error, no
 * "el primero": el operador que pega dos rangos en un input tiene que
 * enterarse de que el segundo no entró.
 */
export function parseSingleSpec(text: string): TokenResult {
  const tokens = splitTokens(text);
  if (tokens.length === 0) return { error: 'vacío' };
  if (tokens.length > 1) return { error: 'una sola entrada por fila (para varias, usá "Pegar lista")' };
  return parseToken(tokens[0]);
}

/**
 * Texto editable de una entrada — inverso de `parseToken` para las formas
 * válidas. Una IP suelta guardada como `start === end` vuelve como una sola
 * IP (el mismo formato que acepta el pegado), no como `x-x`. Una entrada a
 * medio tipear (ver `applySpecText`) vuelve tal cual quedó en `start`.
 */
export function rangeToText(range: IpRange): string {
  if (range.hostname !== undefined) return range.hostname;
  if (range.cidr !== undefined) return range.cidr;
  const start = range.start ?? '';
  const end = range.end ?? '';
  return !end || start === end ? start : `${start}-${end}`;
}

/**
 * Reemplaza la forma (rango / CIDR / hostname) de una entrada por lo tipeado,
 * conservando etiqueta, `enabled`, exclusiones y credenciales. Un texto que
 * todavía no parsea (`10.0.0.1-10.0.0.` a mitad de tecleo, o un typo) queda
 * guardado como `{ start: texto, end: '' }`: así el input sigue mostrando lo
 * que el operador escribió después del blur, y la validación previa al PUT
 * (`firstRangeProblem`) lo rechaza en vez de guardar el último valor válido en
 * silencio. Un hostname no admite exclusiones (el agente resuelve UNA IP).
 */
export function applySpecText(range: IpRange, text: string): IpRange {
  const parsed = parseSingleSpec(text);
  const spec: IpRange = 'range' in parsed ? parsed.range : { start: text, end: '' };
  const next: IpRange = { ...range, start: undefined, end: undefined, cidr: undefined, hostname: undefined, ...spec };
  if (spec.hostname !== undefined) next.exclude = undefined;
  return next;
}

/** Motivo por el que una fila no se puede guardar, o `null` si está bien.
 *  Texto vacío devuelve `null` acá (la fila recién agregada muestra el
 *  placeholder, no un error en rojo) — el vacío lo bloquea `firstRangeProblem`. */
export function specProblem(text: string): string | null {
  if (!text.trim()) return null;
  const parsed = parseSingleSpec(text);
  return 'error' in parsed ? parsed.error : null;
}

/** Validación de forma previa al PUT, compartida por los consumidores del
 *  editor (tab Segmentos y `ConfigAgentModal`): el cloud re-valida formato y
 *  topes en serio (`validateIpRangeSpecs`), acá sólo se evita mandar una
 *  fila vacía o a medio tipear. Numera la fila para que se encuentre entre 59. */
export function firstRangeProblem(ranges: IpRange[]): string | null {
  for (let i = 0; i < ranges.length; i++) {
    const parsed = parseSingleSpec(rangeToText(ranges[i]));
    if ('error' in parsed) {
      return parsed.error === 'vacío'
        ? `El rango ${i + 1} está vacío: completalo o borralo.`
        : `Rango ${i + 1}: ${parsed.error}.`;
    }
  }
  return null;
}

/**
 * Resumen de la lista para mostrar arriba del editor y en la tarjeta de
 * Configuración. Con un rango apagado son DOS números distintos y hay que
 * mostrar los dos: la vuelta cuesta sólo lo habilitado (lo apagado ni se le
 * manda al agente), pero los topes del cloud se miden sobre lo DECLARADO,
 * apagado incluido (`validateIpRangeSpecs`). Rotular sólo lo habilitado es
 * rotular justo el número que NO dispara el 400 del guardado.
 * `fmt` se inyecta para que este módulo siga sin depender del locale del
 * navegador (los tests corren en Node).
 */
export function summaryText(ranges: IpRange[], fmt: (n: number) => string = String): string {
  const enabled = ranges.filter(isRangeEnabled);
  const off = ranges.length - enabled.length;
  const scanned = countTotalDeclaredIps(enabled);
  const declared = countTotalDeclaredIps(ranges);
  const offText = off > 0 ? ` (${off} deshabilitado${off === 1 ? '' : 's'})` : '';
  const head = `${ranges.length} ${ranges.length === 1 ? 'rango' : 'rangos'}${offText}`;
  if (declared === 0) return `${head} · sin IPs declaradas`;
  const ips = scanned === declared ? `${fmt(scanned)} IPs` : `${fmt(scanned)} IPs a barrer de ${fmt(declared)} declaradas`;
  if (scanned === 0) return `${head} · ${ips}`;
  return `${head} · ${ips} · vuelta estimada ~${formatLapDuration(scanned)}`;
}
