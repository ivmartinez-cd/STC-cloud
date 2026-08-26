import type { Knex } from "knex";
import { KnexSystemSettingsRepository } from "./infrastructure/database/knex-system-settings-repository";
import type { SystemSettings } from "./domain/system-settings";

/**
 * Facade del módulo `system-settings`. Lectura de la configuración global para
 * los consumidores externos (hoy `jobs/heartbeatMonitor.ts`, que necesita el
 * umbral de agente offline en cada tick).
 */
export type { SystemSettings } from "./domain/system-settings";
export { DEFAULT_SYSTEM_SETTINGS } from "./domain/system-settings";
export { registerSystemSettingsRoutes } from "./presentation/system-settings-routes";

export function readSystemSettings(db: Knex): Promise<SystemSettings> {
  return new KnexSystemSettingsRepository(db).get();
}

/** Contraseña SMTP en texto plano — sólo para `notificationService/mailer.ts`
 * al momento de enviar/probar (handoff hifi #3, fase 2). Nunca sale por HTTP. */
export function readSmtpPasswordPlaintext(db: Knex): Promise<string | null> {
  return new KnexSystemSettingsRepository(db).getSmtpPasswordPlaintext();
}
