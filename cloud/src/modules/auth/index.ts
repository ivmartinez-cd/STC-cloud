/**
 * Autenticación (portal + agentes) y usuarios. Migrado de
 * `api/controllers/authController/` + `api/routes/authRoutes.ts` a módulo
 * con capas completas en la tanda 2026-08-27 (Fase 2 ya lo había dividido en
 * 385 → 6 archivos; esta pasada sólo reorganiza en domain/application/
 * infrastructure/presentation, sin cambiar contrato externo).
 */
export { registerAuthRoutes } from "./presentation/auth-routes";
export { hashPassword, verifyPassword } from "./domain/services/password-hasher";
