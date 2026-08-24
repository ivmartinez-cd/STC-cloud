/**
 * Ajustes globales de una sola fila (R9 del gap analysis vs HP SDS —
 * conecta el control "Tiempo de Inactividad" de `Settings.tsx`, que hasta
 * ahora sólo escribía a `localStorage`, con el umbral real que usa
 * `jobs/heartbeatMonitor.ts` para marcar un agente offline). Puro: sin
 * Knex/Fastify, mismo criterio que `rolePolicy.ts`/`alertCatalog.ts`.
 *
 * Deliberadamente sólo este UN umbral — no el del equipo
 * (`DEVICE_OFFLINE_THRESHOLD_MINUTES`) ni las copias del portal
 * (`lib/constants.ts`): unificar todas las copias del mismo concepto es
 * el "modelo unificado de umbrales" que el gap analysis ya marca como una
 * pasada aparte, deliberadamente diferida. Éste es el único que tenía un
 * control de UI ya construido y prometiendo hacer algo que no hacía.
 */
export interface SystemSettings {
  agentOfflineThresholdMinutes: number;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = { agentOfflineThresholdMinutes: 5 };

/** Mismo rango que el CHECK de la migración — nunca confiar sólo en la base para el mensaje de error. */
export function validateOfflineThresholdMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1440) {
    throw new Error("El umbral debe ser un entero entre 1 y 1440 minutos");
  }
  return n;
}
