/**
 * API keys de la API pública (integración ERP). El almacén real vive en
 * `services/apiKeyService.ts` — compartido con `authMiddleware` (resolución de
 * `X-Api-Key`), así que NO se migra a este módulo: acá sólo se gestiona desde
 * el portal, scopeado por el `:id` de la URL.
 */
export interface ApiKeyRecord {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface ApiKeyStore {
  list(clientId: string): Promise<ApiKeyRecord[]>;
  /** El valor en claro se devuelve UNA sola vez — no se puede recuperar después. */
  create(clientId: string, name: string): Promise<{ id: string; key: string }>;
  /** Tombstone; devuelve filas tocadas (0 = no existe o ya revocada). */
  revoke(clientId: string, keyId: string): Promise<number>;
}
