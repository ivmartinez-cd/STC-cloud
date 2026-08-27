import type { Knex } from "knex";
import { writeAudit } from "../../../../services/auditService";
import type { LoginAuditPort } from "../../application/use-cases/login-use-case";

/**
 * R5 del gap analysis vs HP SDS ("Audit logs ausentes para: ... logins"):
 * único punto de auditoría de intentos de login, éxito y falla, con el
 * MOTIVO de la falla en `metadata` (nunca la contraseña). `targetId`/`userId`
 * quedan null cuando el usuario no existe — igual se registra el username
 * intentado en `metadata` para poder investigar fuerza bruta por cuenta.
 *
 * El IP se resuelve en la presentación (depende de `FastifyRequest`, que la
 * aplicación no puede importar) y queda cerrado en esta instancia — una por
 * request, no un singleton compartido.
 */
export class KnexLoginAuditGateway implements LoginAuditPort {
  constructor(private readonly db: Knex, private readonly ip: string) {}

  async recordFailure(username: string, reason: string, user?: { id: string }): Promise<void> {
    await writeAudit(this.db, {
      action: "USER_LOGIN_FAILED",
      targetId: user?.id ?? null,
      userId: user?.id ?? null,
      ip: this.ip,
      metadata: { username, reason },
    });
  }

  async recordSuccess(userId: string): Promise<void> {
    await writeAudit(this.db, { action: "USER_LOGIN_SUCCESS", targetId: userId, userId, ip: this.ip });
  }

  async recordRecoveryCodeUsed(userId: string): Promise<void> {
    await writeAudit(this.db, { action: "USER_2FA_RECOVERY_USED", targetId: userId, userId });
  }
}
