import { mergeSuppliesDetails, skuFrom, assetNumberFrom } from "./reading-helpers";
import type { IncomingReading } from "./types";
import type { DisplayFields } from "./sync-reading";

export function parseCount(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export function parseToner(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.min(100, Math.max(0, n));
}

export interface CounterResetInfo {
  counterResets: string[];
  resetValue: number | null;
}

// Detección de reset/decremento de contador: comparar contra el valor previo
// (no contra los extremos del período — eso lo corrige el cálculo de volumen
// mensual). Un reset de firmware o reemplazo de placa formateadora hace que
// el contador físico baje sin que cambie el serial.
export function detectCounterResets(existingDevice: any, newTotal: number | null, newMono: number | null, newColor: number | null): CounterResetInfo {
  const counterResets: string[] = [];
  let resetValue: number | null = null;
  if (newTotal !== null && existingDevice.total_pages !== null && newTotal < existingDevice.total_pages) {
    counterResets.push(`total: ${existingDevice.total_pages} → ${newTotal}`);
    resetValue = newTotal;
  }
  if (newMono !== null && existingDevice.mono_pages !== null && newMono < existingDevice.mono_pages) {
    counterResets.push(`mono: ${existingDevice.mono_pages} → ${newMono}`);
    resetValue = resetValue ?? newMono;
  }
  if (newColor !== null && existingDevice.color_pages !== null && newColor < existingDevice.color_pages) {
    counterResets.push(`color: ${existingDevice.color_pages} → ${newColor}`);
    resetValue = resetValue ?? newColor;
  }
  return { counterResets, resetValue };
}

const NOISE_MODEL = /^(generic|unknown|hp|samsung|lexmark)$|ETHERNET MULTI-ENVIRONMENT|JETDIRECT|\bSeries$/i;

export interface ExistingDeviceFieldPrecedence {
  finalSerial: string | null;
  finalModel: string;
  finalName: string;
}

export function resolveExistingDeviceFields(
  existingDevice: any, cleanModel: string, serialToUse: string | null, ip: string, validHost: string | null
): ExistingDeviceFieldPrecedence {
  // Conservar número de serie real si ya existía uno registrado
  const finalSerial = (existingDevice.serial_number && existingDevice.serial_number !== ip)
    ? existingDevice.serial_number
    : (serialToUse || existingDevice.serial_number || null);

  // Conservar modelo detallado más largo (para evitar degradaciones a 'hp' o 'generic')
  const existingModel = existingDevice.model || "";
  const isGenericModel = NOISE_MODEL.test(cleanModel);
  const existingIsNoise = NOISE_MODEL.test(existingModel);
  // Un modelo comercial nuevo reemplaza ruido (tarjeta JetDirect, "XXX Series") aunque sea más corto.
  const finalModel = (!isGenericModel && (existingIsNoise || cleanModel.length >= existingModel.length)) ? cleanModel : (existingModel || cleanModel);

  // Conservar nombre amigable si ya está bien formateado. Lee `name_reported`
  // (lo último que reportó la ingesta), NO el `name` efectivo (columna
  // generada COALESCE(name_override, name_reported)): si el operador puso un
  // override manual, `existingDevice.name` nunca es "genérico" y este
  // heurístico dejaría a `name_reported` clavado para siempre en el valor
  // previo a la edición manual, en vez de seguir reflejando lo que el equipo
  // realmente reporta.
  const existingName = existingDevice.name_reported || "";
  const isGenericOrModelName = !existingName || existingName === finalSerial || existingName.includes("192.168") || existingName.toLowerCase() === finalModel.toLowerCase();
  const finalName = validHost || (isGenericOrModelName ? cleanModel : existingName);

  return { finalSerial, finalModel, finalName };
}

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export function buildExistingDeviceUpdate(
  r: IncomingReading, existingDevice: any, ip: string, brand: string, fields: ExistingDeviceFieldPrecedence,
  pollMethod: string, resolvedOrigin: string | null, originChanged: boolean
) {
  return {
    ip_address: ip || existingDevice.ip_address,
    serial_number: fields.finalSerial,
    brand: (brand !== 'unknown' && brand !== 'generic') ? brand : existingDevice.brand,
    model: fields.finalModel,
    name_reported: fields.finalName,
    last_seen: new Date(),
    active: true,
    total_pages: parseCount(r.total_pages) ?? existingDevice.total_pages,
    mono_pages: parseCount(r.mono_pages) ?? existingDevice.mono_pages,
    color_pages: parseCount(r.color_pages) ?? existingDevice.color_pages,
    poll_method: pollMethod || existingDevice.poll_method,
    toner_black: parseToner(r.toner_black) ?? existingDevice.toner_black,
    toner_cyan: parseToner(r.toner_cyan) ?? existingDevice.toner_cyan,
    toner_magenta: parseToner(r.toner_magenta) ?? existingDevice.toner_magenta,
    toner_yellow: parseToner(r.toner_yellow) ?? existingDevice.toner_yellow,
    cartridge_code_black: r.cartridge_code_black ?? existingDevice.cartridge_code_black,
    cartridge_code_cyan: r.cartridge_code_cyan ?? existingDevice.cartridge_code_cyan,
    cartridge_code_magenta: r.cartridge_code_magenta ?? existingDevice.cartridge_code_magenta,
    cartridge_code_yellow: r.cartridge_code_yellow ?? existingDevice.cartridge_code_yellow,
    cartridge_serial_black: r.cartridge_serial_black ?? existingDevice.cartridge_serial_black,
    cartridge_serial_cyan: r.cartridge_serial_cyan ?? existingDevice.cartridge_serial_cyan,
    cartridge_serial_magenta: r.cartridge_serial_magenta ?? existingDevice.cartridge_serial_magenta,
    cartridge_serial_yellow: r.cartridge_serial_yellow ?? existingDevice.cartridge_serial_yellow,
    // Fase 8 del gap analysis vs HP SDS — bug real: estas 12 columnas ya
    // existían (migración 20260521100000/20260520120000) y el payload del
    // agente ya las mandaba (pasa el schema Ajv de agentRoutes.ts), pero
    // nunca se persistían acá ni en el INSERT de más abajo. Quedaban NULL
    // para siempre, así que `remainingPages`/`remainingDays` del tóner (que
    // usan `capacity` como base cuando el equipo no informa `remainingPages`
    // directo) no se podían calcular del lado servidor.
    cartridge_capacity_black: parseCount(r.cartridge_capacity_black) ?? existingDevice.cartridge_capacity_black,
    cartridge_capacity_cyan: parseCount(r.cartridge_capacity_cyan) ?? existingDevice.cartridge_capacity_cyan,
    cartridge_capacity_magenta: parseCount(r.cartridge_capacity_magenta) ?? existingDevice.cartridge_capacity_magenta,
    cartridge_capacity_yellow: parseCount(r.cartridge_capacity_yellow) ?? existingDevice.cartridge_capacity_yellow,
    cartridge_printed_black: parseCount(r.cartridge_printed_black) ?? existingDevice.cartridge_printed_black,
    cartridge_printed_cyan: parseCount(r.cartridge_printed_cyan) ?? existingDevice.cartridge_printed_cyan,
    cartridge_printed_magenta: parseCount(r.cartridge_printed_magenta) ?? existingDevice.cartridge_printed_magenta,
    cartridge_printed_yellow: parseCount(r.cartridge_printed_yellow) ?? existingDevice.cartridge_printed_yellow,
    cartridge_estimated_black: parseCount(r.cartridge_estimated_black) ?? existingDevice.cartridge_estimated_black,
    cartridge_estimated_cyan: parseCount(r.cartridge_estimated_cyan) ?? existingDevice.cartridge_estimated_cyan,
    cartridge_estimated_magenta: parseCount(r.cartridge_estimated_magenta) ?? existingDevice.cartridge_estimated_magenta,
    cartridge_estimated_yellow: parseCount(r.cartridge_estimated_yellow) ?? existingDevice.cartridge_estimated_yellow,
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
          existingDevice.supplies_details ? (typeof existingDevice.supplies_details === 'string' ? JSON.parse(existingDevice.supplies_details) : existingDevice.supplies_details) : {},
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
    toner_black: parseToner(r.toner_black),
    toner_cyan: parseToner(r.toner_cyan),
    toner_magenta: parseToner(r.toner_magenta),
    toner_yellow: parseToner(r.toner_yellow),
    cartridge_code_black: r.cartridge_code_black ?? null,
    cartridge_code_cyan: r.cartridge_code_cyan ?? null,
    cartridge_code_magenta: r.cartridge_code_magenta ?? null,
    cartridge_code_yellow: r.cartridge_code_yellow ?? null,
    cartridge_serial_black: r.cartridge_serial_black ?? null,
    cartridge_serial_cyan: r.cartridge_serial_cyan ?? null,
    cartridge_serial_magenta: r.cartridge_serial_magenta ?? null,
    cartridge_serial_yellow: r.cartridge_serial_yellow ?? null,
    // Fase 8 del gap analysis vs HP SDS — mismo fix que en el UPDATE de arriba.
    cartridge_capacity_black: parseCount(r.cartridge_capacity_black),
    cartridge_capacity_cyan: parseCount(r.cartridge_capacity_cyan),
    cartridge_capacity_magenta: parseCount(r.cartridge_capacity_magenta),
    cartridge_capacity_yellow: parseCount(r.cartridge_capacity_yellow),
    cartridge_printed_black: parseCount(r.cartridge_printed_black),
    cartridge_printed_cyan: parseCount(r.cartridge_printed_cyan),
    cartridge_printed_magenta: parseCount(r.cartridge_printed_magenta),
    cartridge_printed_yellow: parseCount(r.cartridge_printed_yellow),
    cartridge_estimated_black: parseCount(r.cartridge_estimated_black),
    cartridge_estimated_cyan: parseCount(r.cartridge_estimated_cyan),
    cartridge_estimated_magenta: parseCount(r.cartridge_estimated_magenta),
    cartridge_estimated_yellow: parseCount(r.cartridge_estimated_yellow),
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
