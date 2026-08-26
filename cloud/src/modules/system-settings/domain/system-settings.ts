/**
 * Ajustes globales de una sola fila (R9 del gap analysis vs HP SDS —
 * conecta el control "Tiempo de Inactividad" de `Settings.tsx`, que hasta
 * ahora sólo escribía a `localStorage`, con el umbral real que usa
 * `jobs/heartbeatMonitor.ts` para marcar un agente offline). Puro: sin
 * Knex/Fastify, mismo criterio que `rolePolicy.ts`/`alertCatalog.ts`.
 *
 * "Modelo unificado de umbrales" (26/08/2026): se sumó
 * `deviceOfflineThresholdMinutes`, la contraparte del EQUIPO — hasta acá
 * vivía en 4 copias independientes del mismo número (`heartbeatMonitor.ts`,
 * `constants.ts`/`formatters.ts` del portal, y las expresiones SQL
 * `DEVICE_ESTADO_SQL`/`AGENT_DEVICE_ESTADO_SQL`). Las 4 leen ahora de acá.
 */
export interface SystemSettings {
  agentOfflineThresholdMinutes: number;
  deviceOfflineThresholdMinutes: number;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  agentOfflineThresholdMinutes: 5,
  deviceOfflineThresholdMinutes: 300,
};

/** Mismo rango para los dos umbrales, mismo CHECK de la migración — nunca confiar sólo en la base para el mensaje de error. */
export function validateOfflineThresholdMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1440) {
    throw new Error("El umbral debe ser un entero entre 1 y 1440 minutos");
  }
  return n;
}
