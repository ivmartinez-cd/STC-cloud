/**
 * Panel de control (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md —
 * dividido desde `dashboardController.ts`, 600 líneas). Migrado de
 * `api/controllers/dashboardController/` a módulo con capas completas en la
 * tanda 2026-08-27. `registerDashboardRoutes` mantiene la misma firma que
 * usaba `api/routes.ts`; `queryClientsCount`/`queryDevicesCount`/
 * `queryAgentsStats`/`queryMonthlyVolume` mantienen la firma que consumía
 * `authController/login-stats.ts` (reusa las mismas queries globales del
 * dashboard para la tira de métricas de /login, con `cid=null`).
 */
import type { Knex } from "knex";
import { KnexDashboardRepository } from "./infrastructure/database/knex-dashboard-repository";

export { registerDashboardRoutes } from "./presentation/dashboard-routes";

export function queryClientsCount(db: Knex, cid: string | null) {
  return new KnexDashboardRepository(db).clientsCount(cid);
}

export function queryDevicesCount(db: Knex, cid: string | null) {
  return new KnexDashboardRepository(db).devicesCount(cid);
}

export function queryAgentsStats(db: Knex, cid: string | null, fiveMinsAgo: Date) {
  return new KnexDashboardRepository(db).agentsStats(cid, fiveMinsAgo);
}

export function queryMonthlyVolume(db: Knex, cid: string | null) {
  return new KnexDashboardRepository(db).monthlyVolume(cid);
}
