import type { ClientRepository } from "../../domain/repositories/client-repository";
import { ClientNotFoundError } from "../../domain/errors/client-error";
import {
  auditMetadata, buildStoredSftpDestination, maskSftpDestination, validateSftpDestination,
} from "../../../../services/sftpDestination";
import type { MaskedSftpDestination } from "../../../../shared/domain/sftp-destination";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { PutSftpDestinationInput } from "../dtos/client-dtos";

/**
 * Destino SFTP de entrega de reportes por cliente (Fase 19 del gap
 * analysis). Mismo criterio que `client-webhook-use-cases.ts`: endpoint
 * dedicado y enmascarado, no el `PUT /clients/:id` genérico — acá además es
 * obligatorio (no opcional como el webhook) porque el material es un secreto
 * cifrado, nunca debe poder colarse por la whitelist de `buildClientUpdates`.
 */
export class GetSftpDestinationUseCase {
  constructor(private readonly clients: ClientRepository) {}
  async execute(clientId: string): Promise<MaskedSftpDestination | { configured: false }> {
    if (!(await this.clients.exists(clientId))) throw new ClientNotFoundError();
    const stored = await this.clients.findSftpDestinationRaw(clientId);
    return maskSftpDestination(stored) ?? { configured: false };
  }
}

export class PutSftpDestinationUseCase {
  constructor(private readonly clients: ClientRepository, private readonly audit: AuditLogWriter) {}

  async execute(input: PutSftpDestinationInput): Promise<MaskedSftpDestination> {
    if (!(await this.clients.exists(input.clientId))) throw new ClientNotFoundError();

    const validated = validateSftpDestination(input.body);
    const stored = buildStoredSftpDestination(validated);
    await this.clients.updateSftpDestination(input.clientId, stored);
    await this.audit.write({
      action: "CLIENT_SFTP_DESTINATION_UPDATED", targetId: input.clientId,
      userId: input.userId, ipAddress: input.ipAddress, metadata: auditMetadata(stored),
    });
    return maskSftpDestination(stored)!;
  }
}

/** `DELETE /clients/:id/sftp-destination` — deja de intentar la entrega SFTP para ese cliente. */
export class DeleteSftpDestinationUseCase {
  constructor(private readonly clients: ClientRepository, private readonly audit: AuditLogWriter) {}

  async execute(clientId: string, actor: { userId: string | null; ipAddress: string | null }): Promise<{ ok: true }> {
    if (!(await this.clients.exists(clientId))) throw new ClientNotFoundError();
    await this.clients.updateSftpDestination(clientId, null);
    await this.audit.write({
      action: "CLIENT_SFTP_DESTINATION_REMOVED", targetId: clientId,
      userId: actor.userId, ipAddress: actor.ipAddress, metadata: {},
    });
    return { ok: true };
  }
}
