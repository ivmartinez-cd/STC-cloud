/**
 * Config del webhook de la API pública (`api_webhooks`). El almacén real vive
 * en `services/publicWebhookService.ts` — compartido con `/api/v1/public/webhook`
 * (autenticado por API key) y con los 3 workers que disparan webhooks, así que
 * NO se migra: acá sólo se gestiona desde el portal, scopeado por `:id`.
 */
export interface WebhookConfig {
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

export interface WebhookConfigPatch {
  url?: string;
  events?: string[];
  active?: boolean;
  regenerateSecret?: boolean;
}

export interface WebhookConfigStore {
  get(clientId: string): Promise<WebhookConfig | null>;
  /** Crea o actualiza; lanza `Error("url es requerida ...")` si no hay url ni existente. */
  upsert(clientId: string, patch: WebhookConfigPatch): Promise<WebhookConfig>;
}
