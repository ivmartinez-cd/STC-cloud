import type { FastifyReply } from "fastify";
import { ValidationError, BusinessRuleViolationError } from "../../../shared/domain/errors";
import { AuthError } from "../domain/errors/auth-error";

/** Mapea errores de aplicación al código HTTP que ya devolvía el controller
 * original — mismo contrato externo, ahora centralizado (mismo patrón que
 * `feedback-controller.ts::sendIfAppError`). */
export function sendIfAuthError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof AuthError) {
    const body: { error: string; totp_required?: boolean } = { error: error.message };
    if (error.totpRequired) body.totp_required = true;
    reply.status(error.statusCode).send(body);
    return true;
  }
  if (error instanceof ValidationError || error instanceof BusinessRuleViolationError) {
    reply.status(400).send({ error: error.message });
    return true;
  }
  return false;
}
