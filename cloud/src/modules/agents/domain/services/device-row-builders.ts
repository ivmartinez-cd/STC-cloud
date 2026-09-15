import type { IncomingReading } from "../entities/agent";
import { parseCount, parseToner, type DisplayFields } from "./reading-parsing";
import { assetNumberFrom, mergeSuppliesDetails, skuFrom } from "./supplies-details";

/** Constructores PUROS de la fila de `devices` en la ingesta — movidos literal de `sync-reading-fields.ts`. */

const NOISE_MODEL = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;
const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export interface ExistingDeviceFieldPrecedence {
  finalSerial: string | null;
  finalModel: string;
  finalName: string;
}

/** Predicado "este texto identifica al equipo". Se INYECTA: vive en el módulo
 *  `devices` y el dominio de `agents` no puede importarlo (check-guards,
 *  `arch-domain`/`arch-cross-module`). Lo pasa la capa de aplicación desde el
 *  facade, para que matcher, índice único y esta precedencia usen el MISMO. */
export type IdentifyingSerialFn = (raw: string | null | undefined, ip?: string | null) => boolean;

export function resolveExistingDeviceFields(
  existingDevice: any, cleanModel: string, serialToUse: string | null, ip: string, validHost: string | null,
  isIdentifyingSerial: IdentifyingSerialFn
): ExistingDeviceFieldPrecedence {
  // Conservar el número de serie REAL si ya había uno registrado. La condición
  // vieja (`!= ip`) sólo descartaba el caso "la IP disfrazada de serial", así
  // que cualquier otro placeholder del firmware quedaba clavado para siempre:
  // el agente podía dejar de mandarlo y la fila seguía mostrándolo. Caso real
  // (15/09/2026): un Epson WF-C5891 cuyo PJL devuelve `?` se quedaba con `?`
  // como serie aunque el agente ya lo descartara.
  //
  // Se reusa `isIdentifyingSerial` —el mismo predicado del matcher y del
  // índice `devices_client_serial_uniq`— para que las tres capas coincidan:
  // un valor que no identifica nunca fue usable para matchear, así que
  // limpiarlo no puede romper la identidad de nada.
  const storedSerial = isIdentifyingSerial(existingDevice.serial_number, ip) ? existingDevice.serial_number : null;
  const incomingSerial = isIdentifyingSerial(serialToUse, ip) ? (serialToUse as string).trim() : null;
  const finalSerial = storedSerial ?? incomingSerial;

  // Conservar modelo detallado más largo (para evitar degradaciones a 'hp' o 'generic')
  const existingModel = existingDevice.model || "";
  const isGenericModel = NOISE_MODEL.test(cleanModel);
  const existingIsNoise = NOISE_MODEL.test(existingModel);
  // Un modelo comercial nuevo reemplaza ruido (tarjeta JetDirect, "XXX Series") aunque sea más corto.
  const finalModel = (!isGenericModel && (existingIsNoise || cleanModel.length >= existingModel.length)) ? cleanModel : (existingModel || cleanModel);

  // Lee `name_reported` (lo último que reportó la ingesta), NO el `name` efectivo
  // (COALESCE(name_override, name_reported)): con un override manual, el
  // heurístico dejaría a `name_reported` clavado para siempre.
  const existingName = existingDevice.name_reported || "";
  const isGenericOrModelName = !existingName || existingName === finalSerial || existingName.includes("192.168") || existingName.toLowerCase() === finalModel.toLowerCase();
  const finalName = validHost || (isGenericOrModelName ? cleanModel : existingName);

  return { finalSerial, finalModel, finalName };
}

const CARTRIDGE_STRING_FIELDS = [
  "cartridge_code_black", "cartridge_code_cyan", "cartridge_code_magenta", "cartridge_code_yellow",
  "cartridge_serial_black", "cartridge_serial_cyan", "cartridge_serial_magenta", "cartridge_serial_yellow",
] as const;

// Fase 8 — estas 12 columnas existían y el agente ya las mandaba, pero nunca se persistían.
const CARTRIDGE_NUMERIC_FIELDS = [
  "cartridge_capacity_black", "cartridge_capacity_cyan", "cartridge_capacity_magenta", "cartridge_capacity_yellow",
  "cartridge_printed_black", "cartridge_printed_cyan", "cartridge_printed_magenta", "cartridge_printed_yellow",
  "cartridge_estimated_black", "cartridge_estimated_cyan", "cartridge_estimated_magenta", "cartridge_estimated_yellow",
] as const;

function cartridgeFields(r: IncomingReading, existing: any | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of CARTRIDGE_STRING_FIELDS) out[f] = r[f] ?? (existing ? existing[f] : null);
  for (const f of CARTRIDGE_NUMERIC_FIELDS) out[f] = parseCount(r[f]) ?? (existing ? existing[f] : null);
  return out;
}

function tonerFields(r: IncomingReading, existing: any | null): Record<string, unknown> {
  return {
    toner_black: parseToner(r.toner_black) ?? existing?.toner_black ?? null,
    toner_cyan: parseToner(r.toner_cyan) ?? existing?.toner_cyan ?? null,
    toner_magenta: parseToner(r.toner_magenta) ?? existing?.toner_magenta ?? null,
    toner_yellow: parseToner(r.toner_yellow) ?? existing?.toner_yellow ?? null,
  };
}

export function buildExistingDeviceUpdate(
  r: IncomingReading, existingDevice: any, ip: string, brand: string, fields: ExistingDeviceFieldPrecedence,
  pollMethod: string, resolvedOrigin: string | null, originChanged: boolean
) {
  return {
    ip_address: ip || existingDevice.ip_address,
    serial_number: fields.finalSerial,
    brand: (brand !== "unknown" && brand !== "generic") ? brand : existingDevice.brand,
    model: fields.finalModel,
    name_reported: fields.finalName,
    last_seen: new Date(),
    active: true,
    total_pages: parseCount(r.total_pages) ?? existingDevice.total_pages,
    mono_pages: parseCount(r.mono_pages) ?? existingDevice.mono_pages,
    color_pages: parseCount(r.color_pages) ?? existingDevice.color_pages,
    poll_method: pollMethod || existingDevice.poll_method,
    ...tonerFields(r, existingDevice),
    ...cartridgeFields(r, existingDevice),
    // Fase 10 del gap analysis vs HP SDS.
    supply_origin: resolvedOrigin ?? existingDevice.supply_origin,
    supply_origin_at: originChanged ? new Date() : existingDevice.supply_origin_at,
    asset_number_reported: assetNumberFrom(r.supplies_details) ?? existingDevice.asset_number_reported,
    firmware: (r.firmware && r.firmware.trim()) ? r.firmware.trim() : (existingDevice.firmware || null),
    mac: (r.mac && MAC_RE.test(r.mac)) ? r.mac : (existingDevice.mac || null),
    hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : (existingDevice.hostname || null),
    location_reported: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : (existingDevice.location_reported || null),
    sku: skuFrom(r.supplies_details) ?? existingDevice.sku ?? null,
    supplies_details: r.supplies_details
      ? JSON.stringify(mergeSuppliesDetails(
          existingDevice.supplies_details ? (typeof existingDevice.supplies_details === "string" ? JSON.parse(existingDevice.supplies_details) : existingDevice.supplies_details) : {},
          r.supplies_details,
        ))
      : existingDevice.supplies_details,
  };
}

export function buildNewDeviceInsert(
  r: IncomingReading, deviceId: string, agentId: string, clientId: string | null, approvalRequired: boolean,
  ip: string, serialToUse: string | null, brand: string, display: DisplayFields, newDeviceOrigin: string | null
) {
  return {
    id: deviceId,
    agent_id: agentId,
    client_id: clientId,
    ip_address: ip || null,
    serial_number: serialToUse || null,
    name_reported: (display.validHost || display.friendlyName).slice(0, 255),
    brand: brand.slice(0, 100),
    model: display.cleanModel.slice(0, 255),
    active: true,
    last_seen: new Date(),
    // Fase 7 del gap analysis vs HP SDS.
    registration_state: approvalRequired ? "pending" : "registered",
    total_pages: parseCount(r.total_pages),
    mono_pages: parseCount(r.mono_pages),
    color_pages: parseCount(r.color_pages),
    poll_method: display.pollMethod,
    ...tonerFields(r, null),
    ...cartridgeFields(r, null),
    // Fase 10 del gap analysis vs HP SDS.
    supply_origin: newDeviceOrigin,
    supply_origin_at: newDeviceOrigin ? new Date() : null,
    asset_number_reported: assetNumberFrom(r.supplies_details),
    firmware: r.firmware ?? null,
    mac: (r.mac && MAC_RE.test(r.mac)) ? r.mac : null,
    hostname: (r.hostname && r.hostname.trim()) ? r.hostname.trim().slice(0, 100) : null,
    location_reported: (r.location && r.location.trim()) ? r.location.trim().slice(0, 255) : null,
    sku: skuFrom(r.supplies_details),
    supplies_details: r.supplies_details ? JSON.stringify(r.supplies_details) : null,
  };
}
