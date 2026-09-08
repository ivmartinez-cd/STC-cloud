import type { Knex } from "knex";
import type { UserAuditPort } from "../../application/ports/user-audit-port";
// Punto único de escritura a `audit_logs` (ARCHITECTURE_GUIDE §8.8): garantiza
// que `client_id` se setee siempre, para que el feed pueda filtrar por cliente.
import { writeAudit } from "../../../../services/auditService";

export class KnexUserAuditGateway implements UserAuditPort {
  constructor(private readonly db: Knex, private readonly ip: string) {}

  async recordCreated(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_CREATED", actorId, targetId, clientId, metadata);
  }

  async recordUpdated(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_UPDATED", actorId, targetId, clientId, metadata);
  }

  async recordDeleted(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.insert("USER_DELETED", actorId, targetId, clientId, metadata);
  }

  private async insert(
    action: string, actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>
  ): Promise<void> {
    await writeAudit(this.db, { action, targetId, clientId, userId: actorId, ip: this.ip, metadata });
  }
}
