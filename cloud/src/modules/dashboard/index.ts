/**
 * Panel de control (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md —
 * dividido desde `dashboardController.ts`, 600 líneas). Migrado de
 * `api/controllers/dashboardController/` a módulo con capas completas en la
 * tanda 2026-08-27. `registerDashboardRoutes` mantiene la misma firma que
 * usaba `api/routes.ts`. `queryClientsCount`/`queryDevicesCount`/
 * `queryAgentsStats`/`queryMonthlyVolume` se exportaban para la tira de
 * métricas pública de /login, eliminada el 14/09/2026 (exponía cifras de toda
 * la red sin sesión); quedan exportadas por si otro consumidor autenticado
 * las necesita.
 */
import type { Knex } from "knex";
import { KnexDashboardRepository } from "./infrastructure/database/knex-dashboard-repository";
import { KnexDashboardSnapshotRepository } from "./infrastructure/database/knex-dashboard-snapshot-repository";
import { CaptureDashboardSnapshotUseCase, type SuppliesProbe } from "./application/use-cases/capture-dashboard-snapshot";

export { registerDashboardRoutes } from "./presentation/dashboard-routes";

/**
 * Toma horaria de las cifras del panel (`dashboardSnapshotJob.ts`) — expuesta
 * por la fachada, como el resto de los módulos que un job consume, para que el
 * job no importe capas internas. La medición de consumibles entra por
 * parámetro: es el único dato del snapshot que sale de otro módulo
 * (`modules/supplies`), y así este módulo no depende de aquél.
 */
export function captureDashboardSnapshot(db: Knex, suppliesOf: SuppliesProbe): Promise<number> {
  return new CaptureDashboardSnapshotUseCase(new KnexDashboardSnapshotRepository(db), suppliesOf).execute();
}

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
