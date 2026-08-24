/**
 * Facade del módulo device-costs (mismo criterio que `modules/inventory`):
 * lo que otros módulos pueden consumir sin conocer la estructura interna.
 * Hoy lo usa `modules/scheduled-reports` para los billing figures del
 * informe de uso.
 */
export { periodCost, type DeviceCosts } from "./domain/entities/device-costs";
export { KnexDeviceCostsRepository } from "./infrastructure/database/knex-device-costs-repository";
export { registerDeviceCostsRoutes } from "./presentation/device-costs-routes";
