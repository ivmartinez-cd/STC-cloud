import type { Knex } from "knex";
import { KnexEmailLogRepository } from "./infrastructure/database/knex-email-log-repository";
import type { EmailLogWrite } from "./domain/entities/email-log-entry";

/**
 * Facade del módulo `email-log`. `services/notificationService.ts` registra cada
 * intento de envío (enviado / error / omitido) sin conocer el repositorio Knex.
 */
export type { EmailLogEntry, EmailLogWrite, EmailStatus } from "./domain/entities/email-log-entry";
export { registerEmailLogRoutes } from "./presentation/email-log-routes";

export function recordEmailAttempt(db: Knex, entry: EmailLogWrite): Promise<void> {
  return new KnexEmailLogRepository(db).record(entry);
}
