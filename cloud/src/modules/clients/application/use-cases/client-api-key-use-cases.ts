import { ClientNotFoundError, ClientValidationError } from "../../domain/errors/client-error";
import type { ApiKeyRecord, ApiKeyStore } from "../ports/api-key-store";
import type { CreateApiKeyInput, RevokeApiKeyInput } from "../dtos/client-dtos";

export class ListApiKeysUseCase {
  constructor(private readonly keys: ApiKeyStore) {}
  execute(clientId: string): Promise<ApiKeyRecord[]> {
    return this.keys.list(clientId);
  }
}

/** El valor en claro se devuelve UNA sola vez acá — no se puede recuperar después. */
export class CreateApiKeyUseCase {
  constructor(private readonly keys: ApiKeyStore) {}
  execute(input: CreateApiKeyInput): Promise<{ id: string; key: string }> {
    const name = input.name?.trim();
    if (!name) throw new ClientValidationError("name es requerido");
    return this.keys.create(input.clientId, name);
  }
}

export class RevokeApiKeyUseCase {
  constructor(private readonly keys: ApiKeyStore) {}
  async execute(input: RevokeApiKeyInput): Promise<{ ok: true }> {
    const updated = await this.keys.revoke(input.clientId, input.keyId);
    if (updated === 0) throw new ClientNotFoundError("API key no encontrada o ya revocada");
    return { ok: true };
  }
}
