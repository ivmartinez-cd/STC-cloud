import { Knex } from "knex";

/**
 * Predicados de ciclo de vida de dispositivos, en un módulo único a propósito:
 * la lista de sitios que necesitan excluir bajas/fusiones tiene 20+ entradas
 * (deviceController, clientController, dashboardController,
 * portalAgentController, heartbeatMonitor, alertWorker, notificationWorker,
 * agentService.globalSearch) y la única defensa contra que el 21° se olvide
 * es que el predicado tenga un nombre grepeable en vez de repetir el
 * `whereNull` a mano en cada lugar.
 *
 * `onlyLiveDevices`: ni de baja ni fusionado — para inventario, conteos y jobs
 * (listDevices, dashboards, heartbeat). `notMerged`: sólo excluye lápidas de
 * fusión — para historia (lecturas, alertas, cierres), donde una baja sigue
 * contando (un equipo dado de baja a mitad de mes igual imprimió ese mes).
 */
export function onlyLiveDevices(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return q.whereNull(`${alias}.decommissioned_at`).whereNull(`${alias}.merged_into`);
}

export function notMerged(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return q.whereNull(`${alias}.merged_into`);
}

/** Fragmentos SQL equivalentes, para los raw() que no pueden usar el query builder. */
export const LIVE_SQL = (alias: string = "devices"): string =>
  `${alias}.decommissioned_at IS NULL AND ${alias}.merged_into IS NULL`;

export const NOT_MERGED_SQL = (alias: string = "devices"): string =>
  `${alias}.merged_into IS NULL`;
