import type { Knex } from "knex";
import crypto from "crypto";
import net from "net";
import { resolveDeviceIdentity } from "../../modules/devices";
import { resolveSupplyOrigin } from "../supplyOrigin";
import { parseNaiveLocalTimestamp } from "../businessHours";
import { logger } from "../../logger";
import { isValidUuid } from "./reading-helpers";
import {
  parseCount, parseToner, detectCounterResets, resolveExistingDeviceFields,
  buildExistingDeviceUpdate, buildNewDeviceInsert,
} from "./sync-reading-fields";
import {
  openCounterResetAlert, handleSupplyOriginAlertsForExisting, openSupplyNonGenuineAlert,
  warnIfDecommissionedStillReporting, syncEwsAlerts, mergeGhostDevicesByIp,
} from "./sync-reading-alerts";
import { recordSyncFailureLog } from "./sync-log";
import type { IncomingReading, MappedReading } from "./types";

export interface DisplayFields {
  cleanModel: string;
  rawSerial: string | null;
  validHost: string | null;
  friendlyName: string;
  pollMethod: string;
}

function parseRawIdentity(r: IncomingReading): { ip: string; serialToUse: string | null } {
  const rawDeviceId = (r.device_id || "").trim();
  const ip = (r.ip || "").trim();
  const isIpAsSerial = !rawDeviceId || (net.isIP(rawDeviceId) !== 0) || rawDeviceId === ip;
  return { ip, serialToUse: isIpAsSerial ? null : rawDeviceId };
}

/**
 * 1. Encontrar el equipo destino por identidad de CLIENTE (serial -> mac ->
 * ip), no por agente. Reemplaza el matcher histórico `agent_id AND (ip OR
 * serial)`, que hacía de la IP una identidad de facto (ver deviceIdentity.ts
 * para el detalle y el bug de DHCP reciclado que esto corrige). Envuelto en
 * una transacción propia: resolveDeviceIdentity toma un advisory lock para
 * serializar agentes concurrentes del mismo cliente sobre la misma impresora.
 */
async function resolveExistingDevice(
  db: Knex, agentId: string, clientId: string | null, ip: string, serialToUse: string | null, mac: string | null | undefined
): Promise<any> {
  if (clientId && (ip || serialToUse)) {
    const { device } = await db.transaction((trx) =>
      resolveDeviceIdentity(trx, { clientId, agentId, serial: serialToUse, mac: mac ?? null, ip })
    );
    return device;
  }
  if (ip || serialToUse) {
    // Fallback defensivo: agente sin client_id resuelto (huérfano). No
    // debería ocurrir en producción, pero no puede tumbar la ingesta.
    return db("devices")
      .where({ agent_id: agentId })
      .whereNull("merged_into")
      .andWhere((builder) => {
        if (ip) builder.where("ip_address", ip);
        if (serialToUse) builder.orWhere("serial_number", serialToUse);
      })
      .first();
  }
  return null;
}

function normalizeBrand(rawBrand: string | undefined, model: string | undefined): string {
  let brand = rawBrand || "unknown";
  if (brand.toLowerCase() === 'generic' && model) {
    if (model.toLowerCase().includes('samsung')) brand = 'Samsung';
    else if (model.toLowerCase().includes('lexmark')) brand = 'Lexmark';
    else if (model.toLowerCase().includes('hp')) brand = 'HP';
    else if (model.toLowerCase().includes('ricoh')) brand = 'Ricoh';
    else if (model.toLowerCase().includes('brother')) brand = 'Brother';
    else if (model.toLowerCase().includes('xerox')) brand = 'Xerox';
  }
  return brand;
}

// ── Fase 5: Estilización Forzada (Backend) ───────────────────────────
function computeDisplayFields(r: IncomingReading, brand: string, serialToUse: string | null, ip: string): DisplayFields {
  const cleanModel = (r.model || "unknown").split(/[;|\r\n]/)[0].trim();
  const rawSerial = serialToUse;

  // Hostname válido solo si no es igual al serie ni a la IP
  const validHost = (r.hostname && r.hostname.trim() && r.hostname.trim().toLowerCase() !== rawSerial?.toLowerCase() && r.hostname.trim() !== ip)
    ? r.hostname.trim()
    : null;

  const sourceName = (r.name && r.name !== rawSerial && r.name !== ip) ? r.name : cleanModel;
  let friendlyName = sourceName.split(/[;|\r\n]/)[0].trim();

  const bLower = brand.toLowerCase();
  if (friendlyName.toLowerCase().startsWith(bLower)) {
    friendlyName = friendlyName.slice(bLower.length).trim();
  }

  if (friendlyName.length < 2 || friendlyName === rawSerial) friendlyName = cleanModel;
  const pollMethod = (r.poll_method || 'snmp').slice(0, 20);

  return { cleanModel, rawSerial, validHost, friendlyName, pollMethod };
}

async function upsertExistingDevice(
  db: Knex, r: IncomingReading, existingDevice: any, ip: string, brand: string, display: DisplayFields, serialToUse: string | null
): Promise<{ deviceId: string; suppressed: boolean }> {
  const deviceId = existingDevice.id;

  // Fase 5 del gap analysis vs HP SDS — estado de monitoreo granular.
  // `disabled`: no se pierde la señal de "sigue vivo" (last_seen/ip), pero no
  // se tocan contadores/tóner/EWS ni se inserta la lectura en `readings` — es
  // la definición de "dejar de monitorear" (distinto de `decommissioned_at`,
  // que además marca el equipo como retirado y resuelve sus alertas).
  // `supplies_only`/`reports_only` NO cortan acá: la lectura se procesa
  // entera y se inserta en `readings` (lossless, criterio R1) — la
  // diferencia la hacen el guard de `alertService.openAlert` (alertable) y
  // `reportService.ts` (billable) sobre el `monitor_state` ya persistido.
  if (existingDevice.monitor_state === "disabled") {
    await db("devices").where("id", deviceId).update({ ip_address: ip || existingDevice.ip_address, last_seen: new Date(), active: true });
    return { deviceId, suppressed: true };
  }

  // Fase 7 del gap analysis vs HP SDS. `ignored`: mismo camino que
  // `disabled` — es una decisión humana explícita de "esto no es un activo
  // mío", corta la ingesta igual. `pending` NO cae acá: sigue procesando la
  // lectura entera (lossless, R1) — sólo queda afuera de `onlyLiveDevices`
  // (inventario/alertas/facturación) hasta que un operador lo registre.
  if (existingDevice.registration_state === "ignored") {
    await db("devices").where("id", deviceId).update({ ip_address: ip || existingDevice.ip_address, last_seen: new Date(), active: true });
    return { deviceId, suppressed: true };
  }

  const fields = resolveExistingDeviceFields(existingDevice, display.cleanModel, serialToUse, ip, display.validHost);
  const newTotal = parseCount(r.total_pages);
  const newMono = parseCount(r.mono_pages);
  const newColor = parseCount(r.color_pages);
  const { counterResets, resetValue } = detectCounterResets(existingDevice, newTotal, newMono, newColor);

  // Fase 10 del gap analysis vs HP SDS — detección de consumible no
  // original. `resolvedOrigin` es null cuando ni el agente ni el jsonb traen
  // señal (nunca se pisa `existingDevice.supply_origin` en ese caso).
  const resolvedOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
  const originChanged = resolvedOrigin !== null && resolvedOrigin !== existingDevice.supply_origin;

  await db("devices").where("id", deviceId).update(
    buildExistingDeviceUpdate(r, existingDevice, ip, brand, fields, display.pollMethod, resolvedOrigin, originChanged)
  );

  if (counterResets.length > 0) await openCounterResetAlert(db, deviceId, counterResets, resetValue);
  await handleSupplyOriginAlertsForExisting(db, deviceId, originChanged, resolvedOrigin);

  return { deviceId, suppressed: false };
}

async function insertNewDevice(
  db: Knex, r: IncomingReading, agentId: string, clientId: string | null, approvalRequired: boolean,
  ip: string, serialToUse: string | null, brand: string, display: DisplayFields
): Promise<string> {
  const deviceId = crypto.randomUUID();
  const newDeviceOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
  await db("devices").insert(
    buildNewDeviceInsert(r, deviceId, agentId, clientId, approvalRequired, ip, serialToUse, brand, display, newDeviceOrigin)
  );
  if (newDeviceOrigin === "non_genuine") await openSupplyNonGenuineAlert(db, deviceId);
  return deviceId;
}

// Parseo seguro de fecha (detectar DD/MM/YYYY — agentes viejos, pre-ISO)
function resolveReadingTime(rawTime: unknown, timezone: string): Date {
  const raw = rawTime || "";
  const parsedNaive = parseNaiveLocalTimestamp(String(raw), timezone);
  if (parsedNaive) return parsedNaive;
  const parsed = new Date(raw as string);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildMappedReading(r: IncomingReading, deviceId: string, readingTime: Date): MappedReading {
  return {
    reading_id: isValidUuid(r.reading_id) ? r.reading_id : null,
    time: readingTime,
    device_id: deviceId,
    total_pages: parseCount(r.total_pages),
    mono_pages: parseCount(r.mono_pages),
    color_pages: parseCount(r.color_pages),
    toner_black: parseToner(r.toner_black),
    toner_cyan: parseToner(r.toner_cyan),
    toner_magenta: parseToner(r.toner_magenta),
    toner_yellow: parseToner(r.toner_yellow),
    supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
    offline: r.offline ?? false,
  };
}

export async function processReading(
  db: Knex, agentId: string, clientId: string | null, approvalRequired: boolean, timezone: string, r: IncomingReading
): Promise<MappedReading | null> {
  try {
    const { ip, serialToUse } = parseRawIdentity(r);
    const existingDevice = await resolveExistingDevice(db, agentId, clientId, ip, serialToUse, r.mac);
    const brand = normalizeBrand(r.brand, r.model);
    const display = computeDisplayFields(r, brand, serialToUse, ip);

    let deviceId: string;
    if (existingDevice) {
      const result = await upsertExistingDevice(db, r, existingDevice, ip, brand, display, serialToUse);
      if (result.suppressed) return null;
      deviceId = result.deviceId;
    } else {
      deviceId = await insertNewDevice(db, r, agentId, clientId, approvalRequired, ip, serialToUse, brand, display);
    }

    await warnIfDecommissionedStillReporting(db, deviceId, existingDevice);
    await syncEwsAlerts(db, deviceId, r.supplies_details);
    await mergeGhostDevicesByIp(db, agentId, deviceId, ip);

    const readingTime = resolveReadingTime(r.time, timezone);
    return buildMappedReading(r, deviceId, readingTime);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err);
    logger.error({ err: errMsg }, `[SYNC] Error procesando dispositivo ${r.device_id}`);
    // Continuamos con el resto de la tanda para no bloquear todo el agente
    if (agentId) {
      await recordSyncFailureLog(db, agentId, `Device Sync Fail [${r.ip || r.device_id}]: ${errMsg}`, timezone);
    }
    return null;
  }
}
