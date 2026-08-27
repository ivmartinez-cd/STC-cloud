import type { Knex } from "knex";
import { getWebhookConfig, upsertWebhookConfig } from "../../../../services/publicWebhookService";
import type {
  PublicWebhookConfigPort, PutPublicWebhookConfigInput,
} from "../../application/ports/public-webhook-config-port";

export class KnexPublicWebhookConfigAdapter implements PublicWebhookConfigPort {
  constructor(private readonly db: Knex) {}

  getWebhookConfig(clientId: string) {
    return getWebhookConfig(this.db, clientId);
  }

  upsertWebhookConfig(clientId: string, input: PutPublicWebhookConfigInput) {
    return upsertWebhookConfig(this.db, clientId, input);
  }
}
