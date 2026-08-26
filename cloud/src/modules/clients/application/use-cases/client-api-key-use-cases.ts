import { ClientNotFoundError, ClientValidationError } from "../../domain/errors/client-error";
import type { ApiKeyRecord, ApiKeyStore } from "../ports/api-key-store";
import type { CreateApiKeyInput, RevokeApiKeyInput } from "../dtos/client-dtos";

export class ListApiKeysUseCase {
  constructor(private readonly keys: ApiKeyStore) {}
  execute(clientId: string): Promise<ApiKeyRecord[]> {
    return this.keys.list(clientId);
  }
}

const MAX_EXPIRES_IN_DAYS = 3650;

/** El valor en claro se devuelve UNA sola vez acá — no se puede recuperar después. */
export class CreateApiKeyUseCase {
  constructor(private readonly keys: ApiKeyStore) {}
  execute(input: CreateApiKeyInput): Promise<{ id: string; key: string }> {
    const name = input.name?.trim();
    if (!name) throw new ClientValidationError("name es requerido");
    const expiresInDays = this.validatedExpiresInDays(input.expiresInDays);
    return this.keys.create(input.clientId, name, expiresInDays);
  }

  /** Mismo rango que el schema Ajv de la ruta — nunca confiar sólo en el schema para el mensaje de error. */
  private validatedExpiresInDays(value: number | null | undefined): number | null | undefined {
    if (value === undefined || value === null) return value;
    if (!Number.isInteger(value) || value < 1 || value > MAX_EXPIRES_IN_DAYS) {
      throw new ClientValidationError(`expiresInDays debe ser un entero entre 1 y ${MAX_EXPIRES_IN_DAYS}`);
    }
    return value;
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
