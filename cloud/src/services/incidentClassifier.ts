import type { AlertClass } from "./alertCatalog";

/**
 * Fase 11 del gap analysis vs HP SDS — único punto de acoplamiento entre
 * incidentes y el diccionario de alertas de la Fase 1. Si `alert_class` ya
 * viene resuelto en la fila (Fase 1 en producción), se usa tal cual; si no
 * (fila vieja pre-Fase-1, o Fase 1 corriendo en otro entorno), se cae a un
 * mapeo básico sobre `alert.type`. Cuando la Fase 1 esté siempre presente,
 * se edita SÓLO este archivo — nada más del módulo de incidentes conoce el
 * formato de `alerts.type`.
 */

const TYPE_FALLBACK: Record<string, string> = {
  device_offline: "availability",
  agent_offline: "availability",
  device_error: "availability",
  device_still_reporting: "information",
  counter_reset: "system_change",
  supply_non_genuine: "information",
};

function fallbackFromType(type: string): string {
  if (TYPE_FALLBACK[type]) return TYPE_FALLBACK[type];
  if (/^toner_.*_critical$/.test(type)) return "consumable_out";
  if (/^toner_.*_low$/.test(type)) return "consumable_low";
  return "other";
}

/** `alert` trae al menos `type`; `alert_class` es opcional (columna de la Fase 1). */
export function classOfAlert(alert: { type: string; alert_class?: AlertClass | null }): string {
  if (alert.alert_class) return alert.alert_class;
  return fallbackFromType(alert.type);
}
