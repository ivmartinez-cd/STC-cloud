/**
 * `alerts` no tiene columna de bandeja — sólo `message`. Extrae una etiqueta de
 * bandeja del texto de la alerta de clase `jam` más reciente, únicamente
 * cuando el mensaje la menciona explícitamente. `null` en cualquier otro caso:
 * nunca se inventa una bandeja que el equipo no reportó.
 */
export function extractTrayLabel(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/\b(mp|bypass|multiprop[oó]sito)\b/i.test(message)) return "bandeja multipropósito";
  const m = message.match(/\b(bandeja|tray|casete|cassette)\s*#?\s*(\d+)\b/i);
  return m ? `bandeja ${m[2]}` : null;
}
