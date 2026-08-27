import type { PublicApiEvent, WebhookConfig } from "../../../../services/publicWebhookService";

export interface PutPublicWebhookConfigInput {
  url?: string;
  events?: PublicApiEvent[];
  active?: boolean;
  regenerateSecret?: boolean;
}

/** Puerto sobre `services/publicWebhookService.ts` (compartido con los
 * workers de notificaciones, no se migra al módulo — ver `index.ts`). */
export interface PublicWebhookConfigPort {
  getWebhookConfig(clientId: string): Promise<WebhookConfig | null>;
  upsertWebhookConfig(clientId: string, input: PutPublicWebhookConfigInput): Promise<WebhookConfig>;
}
