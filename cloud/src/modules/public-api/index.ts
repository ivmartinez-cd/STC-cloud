/**
 * API pública de integración ERP (Fase 2 del gap analysis). Migrado de
 * `api/controllers/publicApiController.ts` + `api/routes/publicApiRoutes.ts`
 * a módulo con capas completas en la tanda 2026-08-27.
 * `services/publicWebhookService.ts` NO se migra acá a propósito — es
 * compartido con los workers de notificaciones (`jobs/*Worker.ts`) y con
 * `modules/clients` (config de webhook desde el portal).
 */
export { registerPublicApiRoutes } from "./presentation/public-api-routes";
