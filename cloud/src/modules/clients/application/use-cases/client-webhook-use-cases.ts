import { ClientNotFoundError } from "../../domain/errors/client-error";
import { assertPortalWebhookEvents } from "../../domain/services/client-rules";
import type { WebhookConfig, WebhookConfigStore } from "../ports/webhook-config-store";
import type { PutWebhookInput } from "../dtos/client-dtos";

/**
 * Gestión del webhook de la API pública desde el portal — mismo almacén que
 * `/api/v1/public/webhook` (autenticado por API key), acá scopeado por el
 * `:id` de la URL. Sin esto, un admin no tenía forma de configurar el webhook
 * sin ya tener una key generada (huevo y gallina).
 */
export class GetWebhookUseCase {
  constructor(private readonly store: WebhookConfigStore) {}
  async execute(clientId: string): Promise<WebhookConfig> {
    const config = await this.store.get(clientId);
    if (!config) throw new ClientNotFoundError("Sin webhook configurado");
    return config;
  }
}

export class PutWebhookUseCase {
  constructor(private readonly store: WebhookConfigStore) {}
  execute(input: PutWebhookInput): Promise<WebhookConfig> {
    assertPortalWebhookEvents(input.events);
    return this.store.upsert(input.clientId, {
      url: input.url, events: input.events, active: input.active, regenerateSecret: input.regenerateSecret,
    });
  }
}
