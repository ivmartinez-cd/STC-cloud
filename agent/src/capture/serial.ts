/**
 * Descarte de seriales que NO identifican al equipo, del lado del agente.
 *
 * El servidor ya tiene esta misma escalera en
 * `cloud/src/modules/devices/domain/services/device-identity.ts`
 * (`isIdentifyingSerial`) y en el índice único `devices_client_serial_uniq`,
 * así que un placeholder nunca fusiona dos impresoras. Pero el agente lo
 * seguía arrastrando como si fuera real, y eso tiene dos efectos propios:
 *
 *  1. El fallback de identidad por IPP de `captureDevice` sólo corre
 *     `if (!identity.serial)`. Un `"?"` es truthy, así que el equipo se
 *     quedaba sin la única vía que le faltaba probar. Caso real: el Epson
 *     WF-C5891 de Canal Directo, cuyo PJL devuelve `?` — SNMP no lo
 *     identifica (todos sus vecinos de subred sí) y su Web Config no publica
 *     la serie, así que IPP era lo único que quedaba y nunca se intentaba.
 *  2. El portal mostraba `?` como número de serie, que es peor que "—":
 *     parece un dato leído cuando en realidad es "el equipo no lo sabe".
 *
 * Las reglas se mantienen ALINEADAS con las del servidor a propósito: si acá
 * se aceptara algo que allá se descarta (o al revés), el agente y el portal
 * mostrarían identidades distintas del mismo equipo.
 */

const GENERIC_SERIAL_RE = /^(unknown|n\/?a|none|null|nil|serial|s\/?n|not ?set|default)$/i;
const REPEATED_CHAR_RE = /^(.)\1*$/;          // "00000000", "XXXXXXXX", "----", "?"
const GENERIC_NUMERIC_RE = /^(sn)?0*123456\d*$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** `true` si el texto identifica físicamente al equipo. Espejo de `isIdentifyingSerial` del servidor. */
export function isRealSerial(raw: string | null | undefined, ip?: string | null): boolean {
  const s = (raw ?? '').trim();
  if (!s) return false;
  if (ip && s === ip.trim()) return false;
  if (IPV4_RE.test(s)) return false;
  if (s.includes(':') && s.split(':').length >= 3) return false; // IPv6 grosero
  if (s.length < 5) return false;
  if (REPEATED_CHAR_RE.test(s)) return false;
  if (GENERIC_SERIAL_RE.test(s)) return false;
  if (GENERIC_NUMERIC_RE.test(s)) return false;
  return true;
}

/** El serial si identifica; `null` si es un placeholder del firmware. */
export function cleanSerial(raw: string | null | undefined, ip?: string | null): string | null {
  return isRealSerial(raw, ip) ? (raw as string).trim() : null;
}
