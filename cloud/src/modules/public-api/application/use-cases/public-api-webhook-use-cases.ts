import type { PublicApiEvent } from "../../../../services/publicWebhookService";
import { NotFoundError, ValidationError } from "../../../../shared/domain/errors";
import type { PublicWebhookConfigPort } from "../ports/public-webhook-config-port";

// Gemelo de `PORTAL_WEBHOOK_EVENTS` (`modules/clients/domain/services/client-rules.ts`)
// — debe reflejar TODOS los eventos que `sendPublicApiWebhook` dispara.
export const VALID_PUBLIC_API_EVENTS: PublicApiEvent[] = [
  "reading.created",
  "alert.created",
  "report.closed",
  "incident.created",
  "incident.closed",
  "supply_request.created",
  "supply_request.completed",
];

export interface PutWebhookInput {
  url?: string;
  events?: string[];
  active?: boolean;
  regenerateSecret?: boolean;
}

/** `publicWebhookService.ts` (`services/`) es deliberadamente compartido con
 * los workers de notificaciones — no se migra al módulo, ver
 * `modules/clients/infrastructure/adapters/public-webhook-config-store.ts`. */
export class GetPublicWebhookUseCase {
  constructor(private readonly webhookConfig: PublicWebhookConfigPort) {}

  async execute(clientId: string) {
    const config = await this.webhookConfig.getWebhookConfig(clientId);
    if (!config) throw new NotFoundError("Sin webhook configurado");
    return config;
  }
}

export class PutPublicWebhookUseCase {
  constructor(private readonly webhookConfig: PublicWebhookConfigPort) {}

  async execute(clientId: string, input: PutWebhookInput) {
    if (input.events && !input.events.every((e) => VALID_PUBLIC_API_EVENTS.includes(e as PublicApiEvent))) {
      throw new ValidationError(`events debe ser subconjunto de ${VALID_PUBLIC_API_EVENTS.join(", ")}`);
    }
    return this.webhookConfig.upsertWebhookConfig(clientId, {
      url: input.url,
      events: input.events as PublicApiEvent[] | undefined,
      active: input.active,
      regenerateSecret: input.regenerateSecret,
    });
  }
}
