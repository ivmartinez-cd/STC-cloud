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
 * `onlyLiveDevices`: ni de baja ni fusionado NI PENDIENTE/IGNORADO — para
 * inventario, conteos y jobs (listDevices, dashboards, heartbeat). Es la
 * definición de "está en la flota" (Fase 7 del gap analysis vs HP SDS,
 * `devices.registration_state` — migración
 * `20260824060000_device_registration_queue.ts`): un equipo `pending` sigue
 * mandando lecturas (se guardan, R1) pero no debe contarse ni alertar hasta
 * que un operador lo registre. `notMerged`: sólo excluye lápidas de
 * fusión — para historia (lecturas, alertas, cierres), donde una baja sigue
 * contando (un equipo dado de baja a mitad de mes igual imprimió ese mes) —
 * `registration_state` tampoco se filtra ahí por el mismo motivo: si un
 * equipo dejó de estar pendiente después de imprimir, el historial ya
 * generado sigue siendo válido.
 */
export function onlyLiveDevices(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return q
    .whereNull(`${alias}.decommissioned_at`)
    .whereNull(`${alias}.merged_into`)
    .where(`${alias}.registration_state`, "registered");
}

export function notMerged(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return q.whereNull(`${alias}.merged_into`);
}

/**
 * Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular
 * (`devices.monitor_state`, migración `20260824050000_devices_monitor_state.ts`).
 * `billableDevices`: vivo + `monitor_state` en ('full','reports_only') — para
 * `reportService.ts` (un equipo `supplies_only`/`disabled` no factura).
 * `alertableDevices`: vivo + `monitor_state` en ('full','supplies_only') —
 * documental (el guard real vive en `alertService.openAlert`, única
 * primitiva de escritura; este predicado es para listados que quieran
 * mostrar "elegible para alertar" sin duplicar la condición a mano).
 */
export function billableDevices(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return onlyLiveDevices(q, alias).whereIn(`${alias}.monitor_state`, ["full", "reports_only"]);
}

export function alertableDevices(q: Knex.QueryBuilder, alias: string = "devices"): Knex.QueryBuilder {
  return onlyLiveDevices(q, alias).whereIn(`${alias}.monitor_state`, ["full", "supplies_only"]);
}

/** Fragmentos SQL equivalentes, para los raw() que no pueden usar el query builder. */
export const LIVE_SQL = (alias: string = "devices"): string =>
  `${alias}.decommissioned_at IS NULL AND ${alias}.merged_into IS NULL AND ${alias}.registration_state = 'registered'`;

export const NOT_MERGED_SQL = (alias: string = "devices"): string =>
  `${alias}.merged_into IS NULL`;
