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
 *
 * "Configuración del sistema" (handoff hifi #3, 26/08/2026, fase 2): se
 * sumaron SMTP (antes sólo env vars, ver `notificationService/mailer.ts`) y
 * los umbrales globales de consumible (antes consts hardcodeadas en
 * `suppliesService/queries.ts`). `smtpPasswordSet` es un booleano derivado —
 * la contraseña en sí NUNCA sale de `get()` en texto plano.
 */
export interface SystemSettings {
  agentOfflineThresholdMinutes: number;
  deviceOfflineThresholdMinutes: number;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  smtpFrom: string | null;
  smtpEncryption: SmtpEncryption;
  supplyThresholdWarningPct: number;
  supplyThresholdCriticalPct: number;
  supplyManualReviewRequired: boolean;
}

export type SmtpEncryption = "none" | "starttls" | "tls";
export const SMTP_ENCRYPTIONS: readonly SmtpEncryption[] = ["none", "starttls", "tls"];

/** Patch de escritura: `smtpPassword` es texto plano (se cifra en el
 * repositorio, nunca en el dominio) — `undefined` = no tocar, `null` = borrar. */
export interface SystemSettingsPatch extends Partial<Omit<SystemSettings, "smtpPasswordSet">> {
  smtpPassword?: string | null;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  agentOfflineThresholdMinutes: 5,
  deviceOfflineThresholdMinutes: 300,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPasswordSet: false,
  smtpFrom: null,
  smtpEncryption: "starttls",
  supplyThresholdWarningPct: 20,
  supplyThresholdCriticalPct: 8,
  supplyManualReviewRequired: false,
};

/** Mismo rango para los dos umbrales, mismo CHECK de la migración — nunca confiar sólo en la base para el mensaje de error. */
export function validateOfflineThresholdMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1440) {
    throw new Error("El umbral debe ser un entero entre 1 y 1440 minutos");
  }
  return n;
}

export function validateSupplyThresholdPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error("El umbral de consumible debe ser un entero entre 1 y 99%");
  }
  return n;
}

export function validateSmtpPort(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error("El puerto SMTP debe ser un entero entre 1 y 65535");
  }
  return n;
}
