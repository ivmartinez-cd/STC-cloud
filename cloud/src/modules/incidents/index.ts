/**
 * Fase 11 del gap analysis vs HP SDS — módulo de incidentes. Migrado de
 * `services/incidentService/` + `api/controllers/incidentController.ts` a
 * módulo con capas completas en la tanda 2026-08-27.
 */
export { registerIncidentRoutes } from "./presentation/incident-routes";
export { IncidentError } from "./domain/errors/incident-error";
export { classOfAlert } from "./domain/services/incident-classifier";
