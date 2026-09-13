import net from "net";
import { parseNaiveLocalTimestamp } from "../../../../shared/domain/business-hours";
import type { IncomingReading, MappedReading } from "../entities/agent";
import { isValidUuid } from "./supplies-details";

/** Parsers PUROS de la ingesta — movidos literal de `sync-reading*.ts`. */

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

// Postgres rechaza de plano cualquier byte NUL embebido en un parámetro de
// texto ("invalid byte sequence for encoding UTF8: 0x00") — no es un tema de
// encoding, el protocolo no lo admite. Algunas impresoras devuelven el serial
// con basura binaria/NUL padding en la respuesta SNMP/EWS; sin esto, ESE
// dispositivo puntual fallaba el advisory lock de identidad (`identityLockKey`,
// `knex-device-identity-resolver.ts`) en TODAS las vueltas de sync, para
// siempre — nunca llegaba a resolverse ni a escribirse en `devices`. Visto en
// producción (ISSN, 12-13/09/2026): 3 equipos (10.3.7.50, 10.10.4.240,
// 10.200.10.217) fallando así en cada ciclo.
function stripNulBytes(s: string): string {
  return s.replace(/\u0000/g, "");
}

/** `device_id` vacío, con forma de IP o igual a la IP = "sin serial real". */
export function parseRawIdentity(r: IncomingReading): { ip: string; serialToUse: string | null } {
  const rawDeviceId = stripNulBytes((r.device_id || "").trim()).trim();
  const ip = (r.ip || "").trim();
  const isIpAsSerial = !rawDeviceId || (net.isIP(rawDeviceId) !== 0) || rawDeviceId === ip;
  return { ip, serialToUse: isIpAsSerial ? null : rawDeviceId };
}

export function normalizeBrand(rawBrand: string | undefined, model: string | undefined): string {
  let brand = rawBrand || "unknown";
  if (brand.toLowerCase() === "generic" && model) {
    const m = model.toLowerCase();
    if (m.includes("samsung")) brand = "Samsung";
    else if (m.includes("lexmark")) brand = "Lexmark";
    else if (m.includes("hp")) brand = "HP";
    else if (m.includes("ricoh")) brand = "Ricoh";
    else if (m.includes("brother")) brand = "Brother";
    else if (m.includes("xerox")) brand = "Xerox";
  }
  return brand;
}

export interface DisplayFields {
  cleanModel: string;
  rawSerial: string | null;
  validHost: string | null;
  friendlyName: string;
  pollMethod: string;
}

// ── Fase 5: Estilización Forzada (Backend) ───────────────────────────
export function computeDisplayFields(r: IncomingReading, brand: string, serialToUse: string | null, ip: string): DisplayFields {
  const cleanModel = (r.model || "unknown").split(/[;|\r\n]/)[0].trim();
  const rawSerial = serialToUse;
  // Hostname válido solo si no es igual al serie ni a la IP
  const validHost = (r.hostname && r.hostname.trim() && r.hostname.trim().toLowerCase() !== rawSerial?.toLowerCase() && r.hostname.trim() !== ip)
    ? r.hostname.trim()
    : null;
  const sourceName = (r.name && r.name !== rawSerial && r.name !== ip) ? r.name : cleanModel;
  let friendlyName = sourceName.split(/[;|\r\n]/)[0].trim();
  const bLower = brand.toLowerCase();
  if (friendlyName.toLowerCase().startsWith(bLower)) friendlyName = friendlyName.slice(bLower.length).trim();
  if (friendlyName.length < 2 || friendlyName === rawSerial) friendlyName = cleanModel;
  const pollMethod = (r.poll_method || "snmp").slice(0, 20);
  return { cleanModel, rawSerial, validHost, friendlyName, pollMethod };
}

// Parseo seguro de fecha (detectar DD/MM/YYYY — agentes viejos, pre-ISO)
export function resolveReadingTime(rawTime: unknown, timezone: string): Date {
  const raw = rawTime || "";
  const parsedNaive = parseNaiveLocalTimestamp(String(raw), timezone);
  if (parsedNaive) return parsedNaive;
  const parsed = new Date(raw as string);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function buildMappedReading(r: IncomingReading, deviceId: string, readingTime: Date): MappedReading {
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
