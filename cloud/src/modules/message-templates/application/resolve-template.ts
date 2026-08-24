import type { Knex } from "knex";
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  type TemplateContent,
  type TemplateEvent,
} from "../domain/entities/message-template";
import { KnexTemplateRepository } from "../infrastructure/database/knex-template-repository";

/**
 * Precedencia: plantilla del cliente → plantilla global → default hardcodeado.
 * Best-effort: cualquier error de lectura cae al default (una plantilla rota
 * jamás debe frenar el envío de una notificación).
 */
export async function resolveTemplate(
  db: Knex,
  clientId: string | null,
  event: TemplateEvent
): Promise<TemplateContent> {
  try {
    const repo = new KnexTemplateRepository(db);
    if (clientId) {
      const own = await repo.findByScopeAndEvent(clientId, event);
      if (own) return { subject: own.subject, body: own.body };
    }
    const global = await repo.findByScopeAndEvent(null, event);
    if (global) return { subject: global.subject, body: global.body };
  } catch {
    // caer al default
  }
  return DEFAULT_TEMPLATES[event];
}

/** Resuelve y renderiza en un paso — lo que consumen los workers. */
export async function renderFor(
  db: Knex,
  clientId: string | null,
  event: TemplateEvent,
  vars: Record<string, string | number | null>
): Promise<TemplateContent> {
  return renderTemplate(await resolveTemplate(db, clientId, event), vars);
}
