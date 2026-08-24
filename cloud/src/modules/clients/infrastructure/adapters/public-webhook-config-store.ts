import type { Knex } from "knex";
import { getWebhookConfig, upsertWebhookConfig, type PublicApiEvent } from "../../../../services/publicWebhookService";
import type { WebhookConfig, WebhookConfigPatch, WebhookConfigStore } from "../../application/ports/webhook-config-store";

/** Adapter sobre `services/publicWebhookService.ts` (compartido con la API pública y los workers, no se migra). */
export class PublicWebhookConfigStore implements WebhookConfigStore {
  constructor(private readonly db: Knex) {}

  get(clientId: string): Promise<WebhookConfig | null> {
    return getWebhookConfig(this.db, clientId);
  }

  upsert(clientId: string, patch: WebhookConfigPatch): Promise<WebhookConfig> {
    return upsertWebhookConfig(this.db, clientId, {
      url: patch.url,
      events: patch.events as PublicApiEvent[] | undefined,
      active: patch.active,
      regenerateSecret: patch.regenerateSecret,
    });
  }
}
