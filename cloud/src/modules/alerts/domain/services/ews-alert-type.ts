import crypto from "crypto";

/**
 * Deriva un `type` estable para una alerta EWS. Si el dispositivo manda `code` se
 * usa tal cual (es lo que hoy sucede en el 100% de las filas EWS reales); si no,
 * se sintetiza un hash corto del mensaje — así dos alertas EWS *distintas* del mismo
 * equipo (ambas sin código) no colapsan sobre un único type `EWS_ALERT` bajo la
 * dedupe por tipo (antes deduplicaba por mensaje completo, así que esto no
 * importaba).
 */
export function synthesizeEwsAlertType(code: string | undefined | null, message: string): string {
  const trimmed = code?.trim();
  if (trimmed) return trimmed.slice(0, 50);
  return `ews_${crypto.createHash("sha1").update(message).digest("hex").slice(0, 12)}`;
}
