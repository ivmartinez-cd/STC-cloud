import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  type MessageTemplate,
  type TemplateContent,
  type TemplateEvent,
} from "../domain/entities/message-template";

/** Puerto de lectura que necesita la resolución (lo implementa `KnexTemplateRepository`). */
export interface TemplateReader {
  findByScopeAndEvent(clientId: string | null, event: TemplateEvent): Promise<MessageTemplate | null>;
}

/**
 * Precedencia: plantilla del cliente → plantilla global → default hardcodeado.
 * Best-effort: cualquier error de lectura cae al default (una plantilla rota
 * jamás debe frenar el envío de una notificación).
 */
export async function resolveTemplate(
  repo: TemplateReader,
  clientId: string | null,
  event: TemplateEvent
): Promise<TemplateContent> {
  try {
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

/** Resuelve y renderiza en un paso — lo que consumen los workers (vía el facade del módulo). */
export async function renderFor(
  repo: TemplateReader,
  clientId: string | null,
  event: TemplateEvent,
  vars: Record<string, string | number | null>
): Promise<TemplateContent> {
  return renderTemplate(await resolveTemplate(repo, clientId, event), vars);
}
