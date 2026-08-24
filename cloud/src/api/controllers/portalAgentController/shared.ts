/**
 * Columnas seguras de `agents` para exponer por el portal. Reemplaza el `agents.*`
 * anterior, que devolvía `jwt_secret`, `refresh_token_hash` y una `activation_key`
 * VIVA (se reemite en `regenerateActivationKey` — no es sólo una clave ya usada) a
 * cualquier rol, incluido `client_viewer`. `activation_key` se agrega de vuelta sólo
 * para admin/operator (la usa `LicenseCard.tsx` en el portal); `jwt_secret` y
 * `refresh_token_hash` no se exponen NUNCA, ningún consumidor del portal los usa.
 */
export const AGENT_SAFE_COLUMNS = [
  "agents.id",
  "agents.client_id",
  "agents.name",
  "agents.status",
  "agents.last_seen",
  "agents.created_at",
  "agents.hardware_id",
  "agents.version",
  "agents.host_name",
  "agents.host_os",
  "agents.host_ip",
  "agents.uptime",
  "agents.scan_interval_minutes",
  "agents.remote_ews_enabled",
];

/** Parámetros de ruta con ID de agente. */
export interface AgentIdParams { id: string; }

/** Query string con límite opcional. */
export interface LimitQuery { limit?: string; }

export function formatDateAR(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return date.toISOString();
  }
}
