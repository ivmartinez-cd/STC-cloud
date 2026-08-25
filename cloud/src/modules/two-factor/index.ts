import type { Knex } from "knex";
import { KnexRecoveryCodeRepository } from "./infrastructure/database/knex-recovery-code-repository";

/**
 * Facade del módulo `two-factor`. El login (`authController/session.ts`) necesita
 * verificar el segundo factor: un TOTP contra el secreto del usuario, o un código
 * de recuperación de un solo uso (consumo atómico). El resto (enrolar, regenerar
 * códigos, deshabilitar) vive en `presentation/two-factor-routes.ts`.
 */
export { verifyTotp } from "./domain/totp";
export { looksLikeRecoveryCode } from "./domain/recovery-codes";
export { registerTwoFactorRoutes } from "./presentation/two-factor-routes";

/** Consume un código de recuperación del usuario. `true` si era válido y no estaba usado. */
export function consumeRecoveryCode(db: Knex, userId: string, code: string): Promise<boolean> {
  return new KnexRecoveryCodeRepository(db).consume(userId, code);
}
