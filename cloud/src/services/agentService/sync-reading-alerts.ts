import type { Knex } from "knex";
import * as alertService from "../../modules/alerts";
import { mergeDevices } from "../deviceLifecycleService";
import { logger } from "../../logger";

// Alerta de EVENTO, no de estado: dedupe por (device_id,type) — antes era por
// mensaje exacto, que incluye los valores del contador, así que un segundo
// reset con valores distintos nunca deduplicaba y las filas se acumulaban sin
// límite. Con la dedupe por tipo, un segundo reset mientras el primero sigue
// abierto queda suprimido a propósito (ya se avisó; no hace falta una segunda
// fila) — sólo `PUT /alerts/:id` la cierra, no hay condición de "esto ya no
// pasa" que la auto-resuelva.
export async function openCounterResetAlert(db: Knex, deviceId: string, counterResets: string[], resetValue: number | null): Promise<void> {
  const resetMsg = `Contador(es) con reset o decremento detectado: ${counterResets.join(', ')}`;
  await alertService.openAlert(db, {
    deviceId, type: "counter_reset", severity: "critical", message: resetMsg, value: resetValue,
  });
}

// Fase 10 del gap analysis vs HP SDS — alerta de ESTADO (como los
// toner_*_low), no de evento: se abre al transicionar a no-original y se
// resuelve sola si vuelve a genuine (o si el equipo se reemplaza el cartucho
// por uno original). Nunca se abre/cierra por un `resolvedOrigin` null (sin
// señal no es lo mismo que "es original").
export async function handleSupplyOriginAlertsForExisting(db: Knex, deviceId: string, originChanged: boolean, resolvedOrigin: string | null): Promise<void> {
  if (originChanged && resolvedOrigin === "non_genuine") {
    await alertService.openAlert(db, {
      deviceId, type: "supply_non_genuine", severity: "warning",
      message: "Se detectó un consumible no original instalado", value: null,
    });
  } else if (originChanged && resolvedOrigin === "genuine") {
    await alertService.resolveAlert(db, { deviceId, type: "supply_non_genuine" });
  }
}

// Fase 10 del gap analysis vs HP SDS — un equipo recién descubierto cuya
// primera lectura ya trae un cartucho no original también alerta.
export async function openSupplyNonGenuineAlert(db: Knex, deviceId: string): Promise<void> {
  await alertService.openAlert(db, {
    deviceId, type: "supply_non_genuine", severity: "warning",
    message: "Se detectó un consumible no original instalado", value: null,
  });
}

// El matcher nunca revive una baja: sigue guardando lecturas y contadores,
// pero deja `decommissioned_at` intacto. Se avisa en vez de reactivar en
// silencio, para que un operador decida entre reactivar o retirar el equipo
// de la red de verdad.
export async function warnIfDecommissionedStillReporting(db: Knex, deviceId: string, existingDevice: any): Promise<void> {
  if (!existingDevice?.decommissioned_at) return;
  await alertService.openAlert(db, {
    deviceId, type: "device_still_reporting", severity: "warning",
    message: "Equipo dado de baja pero sigue reportando lecturas",
  });
}

// Sincronizar alertas activas provenientes de EWS si están presentes. Dedupe
// por `type` (antes era por mensaje exacto, y nunca se resolvían solas); acá
// además se resuelve cualquier alerta EWS previamente abierta de este
// dispositivo que ya no aparezca en la lista actual — es la primera vez que
// las alertas EWS tienen un camino de auto-resolución.
export async function syncEwsAlerts(db: Knex, deviceId: string, suppliesDetailsRaw: unknown): Promise<void> {
  const suppliesObj = typeof suppliesDetailsRaw === 'string' ? JSON.parse(suppliesDetailsRaw) : suppliesDetailsRaw;
  if (!(suppliesObj?.alerts && Array.isArray(suppliesObj.alerts))) return;

  const currentTypes: string[] = [];
  for (const alertItem of suppliesObj.alerts) {
    if (!(alertItem.description || alertItem.code)) continue;
    const alertMsg = alertItem.description || alertItem.code;
    const alertType = alertService.synthesizeEwsAlertType(alertItem.code, alertMsg);
    const sevLower = String(alertItem.severity || '').toLowerCase();
    const alertSev = (sevLower === 'critical' || sevLower === 'error' || sevLower === 'danger') ? 'critical' : 'warning';

    currentTypes.push(alertType);
    await alertService.openAlert(db, {
      deviceId, type: alertType, severity: alertSev, message: alertMsg, origin: "device",
    });
  }
  await alertService.resolveStaleDeviceAlerts(db, { deviceId, currentTypes });
}

// Consolidar cualquier otro registro fantasma duplicado en esta IP, vía la
// primitiva única de fusión (deja lápida en vez de DELETE — antes esto
// borraba `alerts` por CASCADE sin reapuntarlas primero, y nunca tocaba
// `report_closure_lines`).
export async function mergeGhostDevicesByIp(db: Knex, agentId: string, deviceId: string, ip: string): Promise<void> {
  if (!ip) return;
  const ghostDeviceIds: string[] = await db("devices")
    .where({ agent_id: agentId, ip_address: ip })
    .whereNot("id", deviceId)
    .whereNull("merged_into")
    .andWhere((b) => b.whereNull("serial_number").orWhere("serial_number", ip))
    .pluck("id");

  for (const ghostId of ghostDeviceIds) {
    try {
      await mergeDevices(db, {
        targetId: deviceId, sourceId: ghostId, reason: "ghost_ip", actor: "ingest", onOverlap: "keep_target",
      });
    } catch (mergeErr: unknown) {
      // No debe tumbar la ingesta de la lectura actual — un fantasma sin
      // fusionar simplemente queda para revisión manual en /devices/duplicates.
      logger.error({ err: mergeErr }, `[SYNC] No se pudo fusionar fantasma ${ghostId} -> ${deviceId}`);
    }
  }
}
