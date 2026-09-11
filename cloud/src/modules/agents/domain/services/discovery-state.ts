import type { AgentDiscoveryState } from "../entities/agent";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isIsoOrNull = (v: unknown): boolean => v === null || typeof v === "string";

/**
 * Guard de forma sobre `discovery_state`. La ruta del heartbeat no tiene schema
 * de body, así que lo que manda el agente entra crudo: un escalar, un array o
 * el objeto a medias son posibles (agente con un bug, o cualquiera con un token
 * de agente). Si no cumple el contrato completo vale lo mismo que no haberlo
 * reportado — es un campo informativo, no se adivinan defaults en cero.
 */
export function isAgentDiscoveryState(value: unknown): value is AgentDiscoveryState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  return typeof s.in_progress === "boolean"
    && isNum(s.scanned) && isNum(s.total) && isNum(s.laps_completed)
    && isIsoOrNull(s.lap_started_at) && isIsoOrNull(s.last_lap_at)
    && (s.last_lap_ms === null || isNum(s.last_lap_ms));
}

/**
 * Lee la columna jsonb `agents.discovery_state`. A propósito NO usa
 * `parseJsonColumn`: el contenido lo escribió el agente, y un jsonb que guarde
 * un string suelto (`"foo"`) vuelve del driver como string, ahí `JSON.parse`
 * tira `SyntaxError` y se lleva puesto todo `GET /agents/:id/stats`.
 */
export function readAgentDiscoveryState(raw: unknown): AgentDiscoveryState | null {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return null; }
  }
  return isAgentDiscoveryState(value) ? value : null;
}
