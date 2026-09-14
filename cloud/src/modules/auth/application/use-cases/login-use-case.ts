import { looksLikeRecoveryCode, verifyTotp } from "../../../two-factor";
import { decryptSecret } from "../../../../services/cryptoService";
import crypto from "crypto";
import { hashPassword, verifyPassword } from "../../domain/services/password-hasher";
import type { UserRepository, UserRow } from "../../domain/repositories/user-repository";
import { InvalidCredentialsError, TotpRequiredError } from "../../domain/errors/auth-error";

/** Hash de un valor aleatorio: contra esto se verifica cuando el usuario no existe, para que el tiempo de respuesta no lo delate. */
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));
import type { TwoFactorGateway } from "../ports/two-factor-gateway";

export interface LoginAuditPort {
  recordFailure(username: string, reason: string, user?: { id: string }): Promise<void>;
  recordSuccess(userId: string): Promise<void>;
  recordRecoveryCodeUsed(userId: string): Promise<void>;
}

export interface LoginResult {
  user: UserRow;
  totpEnrollmentRequired: boolean;
}

/** Verificación de credenciales + 2FA — sin tocar cookies/JWT (eso es
 * responsabilidad de la presentación, que sí depende de Fastify). */
export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly audit: LoginAuditPort,
    private readonly twoFactor: TwoFactorGateway
  ) {}

  async execute(usernameRaw: string, password: string, totpCode: string | undefined): Promise<LoginResult> {
    const username = usernameRaw.trim().toLowerCase();

    // El servidor siempre crea un usuario administrador real en el primer
    // boot (ver server.ts), así que no existe fallback por variable de
    // entorno: si no está en la tabla, no hay acceso.
    const user = await this.users.findByUsername(username);
    if (!user) {
      // Se corre scrypt igual: si el usuario inexistente respondiera al instante
      // y el existente después de decenas de ms, el tiempo revelaría qué
      // usuarios hay (auditoría de seguridad, 14/09/2026).
      verifyPassword(password, DUMMY_HASH);
      await this.audit.recordFailure(username, "unknown_user");
      throw new InvalidCredentialsError();
    }

    if (!user.active) {
      // Mismo mensaje que credenciales inválidas: "usuario desactivado" confirmaba que la cuenta existe. El motivo real queda en la auditoría.
      await this.audit.recordFailure(username, "disabled", user);
      throw new InvalidCredentialsError();
    }

    if (!verifyPassword(password, user.password_hash)) {
      await this.audit.recordFailure(username, "bad_password", user);
      throw new InvalidCredentialsError();
    }

    // 2FA TOTP opt-in: con el flag activo, la contraseña sola no alcanza.
    // `totp_required: true` en la respuesta le dice al portal que muestre el
    // segundo paso SIN revelar si la contraseña era correcta a un atacante
    // sin código (el mensaje de error es el mismo genérico).
    if (user.totp_enabled) {
      if (!totpCode) throw new TotpRequiredError();
      if (looksLikeRecoveryCode(totpCode)) {
        // Fase 6.2: un código de recuperación de un solo uso vale como
        // segundo factor (consumo atómico + auditoría — perdió el teléfono).
        const consumed = await this.twoFactor.consumeRecoveryCode(user.id, totpCode);
        if (!consumed) {
          await this.audit.recordFailure(username, "bad_recovery_code", user);
          throw new InvalidCredentialsError("Credenciales inválidas", true);
        }
        await this.audit.recordRecoveryCodeUsed(user.id);
      } else if (!verifyTotp(decryptSecret(user.totp_secret ?? ""), totpCode, Date.now())) {
        await this.audit.recordFailure(username, "bad_totp", user);
        throw new InvalidCredentialsError("Credenciales inválidas", true);
      }
    }

    await this.audit.recordSuccess(user.id);

    const totpEnrollmentRequired = user.totp_required === true && user.totp_enabled !== true;
    return { user, totpEnrollmentRequired };
  }
}
