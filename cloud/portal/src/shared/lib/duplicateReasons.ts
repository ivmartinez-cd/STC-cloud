/** Motivos que devuelve `GET /devices/duplicates` (`DUPLICATES_SQL`, backend) y
 * la clave concreta que coincidió — lo que el operador necesita para entender
 * POR QUÉ dos filas se consideran el mismo equipo (auditoría 27/08/2026: la
 * tarjeta decía "detectados por número de serie" para pares que en realidad
 * coincidían por hostname o IP, y no mostraba el valor compartido). */

export const DUPLICATE_REASON_LABEL: Record<string, string> = {
  same_mac: 'misma MAC',
  same_serial_different_monitor: 'mismo serial en dos monitores',
  ghost_same_ip: 'fantasma sin serial en la misma IP',
  same_ip: 'misma IP en el mismo monitor',
  same_hostname: 'mismo hostname',
};

export interface DuplicateReasonSource {
  reason: string;
  a_serial: string | null; a_mac: string | null; a_ip: string | null; a_hostname?: string | null;
}

/** "misma MAC · b0:0c:d1:be:f0:ea" — motivo + valor compartido. */
export function describeDuplicateMatch(c: DuplicateReasonSource): string {
  const reason = DUPLICATE_REASON_LABEL[c.reason] ?? c.reason;
  const key = duplicateMatchKey(c);
  return key ? `${reason} · ${key}` : reason;
}

function duplicateMatchKey(c: DuplicateReasonSource): string | null {
  switch (c.reason) {
    case 'same_mac': return c.a_mac;
    case 'same_serial_different_monitor': return c.a_serial;
    case 'ghost_same_ip':
    case 'same_ip': return c.a_ip;
    case 'same_hostname': return c.a_hostname ?? null;
    default: return null;
  }
}
