import type { Knex } from "knex";
import { KnexTemplateRepository } from "./infrastructure/database/knex-template-repository";
import { renderFor as renderWith, resolveTemplate as resolveWith } from "./application/resolve-template";
import type { TemplateContent, TemplateEvent } from "./domain/entities/message-template";

/**
 * Facade del módulo `message-templates`. Los workers de notificaciones consumen
 * `renderFor(db, …)`; el cableado del repositorio Knex vive acá y no en ellos.
 */
export type { TemplateContent, TemplateEvent, MessageTemplate } from "./domain/entities/message-template";
export { eventEnabledFor, renderTemplate, DEFAULT_TEMPLATES, TEMPLATE_EVENTS } from "./domain/entities/message-template";
export { registerMessageTemplateRoutes } from "./presentation/template-routes";

export function resolveTemplate(db: Knex, clientId: string | null, event: TemplateEvent): Promise<TemplateContent> {
  return resolveWith(new KnexTemplateRepository(db), clientId, event);
}

export function renderFor(
  db: Knex,
  clientId: string | null,
  event: TemplateEvent,
  vars: Record<string, string | number | null>
): Promise<TemplateContent> {
  return renderWith(new KnexTemplateRepository(db), clientId, event, vars);
}
