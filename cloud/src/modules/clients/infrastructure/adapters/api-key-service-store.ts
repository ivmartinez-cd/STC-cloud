import type { Knex } from "knex";
import * as apiKeyService from "../../../../services/apiKeyService";
import type { ApiKeyRecord, ApiKeyStore } from "../../application/ports/api-key-store";

/** Adapter sobre `services/apiKeyService.ts` (compartido con `authMiddleware`, no se migra). */
export class ApiKeyServiceStore implements ApiKeyStore {
  constructor(private readonly db: Knex) {}

  list(clientId: string): Promise<ApiKeyRecord[]> {
    return apiKeyService.listApiKeys(this.db, clientId);
  }

  create(clientId: string, name: string, expiresInDays?: number | null): Promise<{ id: string; key: string }> {
    return apiKeyService.createApiKey(this.db, clientId, name, expiresInDays);
  }

  revoke(clientId: string, keyId: string): Promise<number> {
    return apiKeyService.revokeApiKey(this.db, clientId, keyId);
  }
}
