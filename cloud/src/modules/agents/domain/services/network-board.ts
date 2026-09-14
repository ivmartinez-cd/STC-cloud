/**
 * Placa de red reseteada: en taller se resetean las placas controladoras y la
 * MAC queda en un valor de relleno del firmware (`00:00:f0:a0:00:00` en las HP
 * 604CDD de ISSN, 14/09/2026) hasta que alguien restaura los valores de
 * fábrica de la placa de red. Mientras tanto el equipo funciona, pero la MAC
 * no identifica nada: la escalera de identidad no puede usarla y varios
 * equipos "comparten" la misma. Se avisa por alerta para que el técnico la
 * restaure; no es un duplicado (ver `DUPLICATES_SQL`).
 */
export const NETWORK_BOARD_RESET_ALERT = "network_board_reset";

const OBVIOUS_PLACEHOLDERS = new Set(["00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"]);

/**
 * Una MAC es de relleno si es la nula/broadcast, o si la comparten OTROS dos o
 * más equipos vivos del mismo cliente: una placa física no puede estar en tres
 * equipos a la vez. Con un solo otro equipo no se afirma nada — ese es el caso
 * real de un serial mal leído sobre la misma placa, que sí es duplicado.
 */
export function isPlaceholderMac(mac: string | null | undefined, otherLiveDevicesWithSameMac: number): boolean {
  if (!mac) return false;
  if (OBVIOUS_PLACEHOLDERS.has(mac.trim().toLowerCase())) return true;
  return otherLiveDevicesWithSameMac >= 2;
}

export function networkBoardResetMessage(mac: string): string {
  return `La placa de red reporta la MAC de relleno ${mac}: parece reseteada. Restaurar los valores de fábrica de la placa de red para que vuelva a tomar la MAC real.`;
}
