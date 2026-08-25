/**
 * Horario laboral + TZ configurable por agente (§2.1/§3 R7 gap analysis).
 * Lógica pura — sin Knex, sin Fastify — mismo estilo que `ipRangeSpec.ts` /
 * `snmpCredentials.ts`.
 *
 * Se guarda en `agents.business_hours` (jsonb nullable, migración nueva —
 * a diferencia de `ip_ranges`, esta columna no existía antes). `null` en la
 * columna significa "usa el default hardcodeado de hoy" (Argentina, L-V,
 * 8-18) — cero cambio de comportamiento para agentes sin configurar. NO
 * confundir con el extinto `agents.scan_schedule` (migración
 * `20260524020000`, removida en `20260823020000`): era un scheduler custom
 * de días/horas reemplazado por este mecanismo — código muerto desde mayo,
 * eliminado en vez de revivido (ver esa migración para el porqué).
 */

export interface BusinessHoursConfig {
  /** IANA TZ, ej. "America/Argentina/Buenos_Aires", "America/Santiago". */
  timezone: string;
  /** ISO weekday: 1=lunes .. 7=domingo. */
  days: number[];
  /** 0-23. */
  start_hour: number;
  /** 1-24 (24 = "hasta medianoche"). Debe ser > start_hour. */
  end_hour: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: "America/Argentina/Buenos_Aires",
  days: [1, 2, 3, 4, 5],
  start_hour: 8,
  end_hour: 18,
};

export class BusinessHoursValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida el body de `business_hours` (PUT config / POST alta de monitor).
 * `raw === null` es un reset explícito al default (distinto de `undefined`,
 * que en el caller significa "no tocar este campo"). Lanza
 * `BusinessHoursValidationError` con `field` para que el portal pinte el
 * campo puntual.
 */
export function validateBusinessHours(raw: unknown): BusinessHoursConfig | null {
  if (raw === null) return null;
  if (raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BusinessHoursValidationError("business_hours debe ser un objeto o null", "business_hours");
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.timezone !== "string" || !o.timezone.trim() || !isValidTimezone(o.timezone.trim())) {
    throw new BusinessHoursValidationError("business_hours.timezone inválida (debe ser un TZ IANA, ej. America/Santiago)", "business_hours.timezone");
  }
  const timezone = o.timezone.trim();

  if (!Array.isArray(o.days) || o.days.length === 0) {
    throw new BusinessHoursValidationError("business_hours.days requiere al menos 1 día (1=lunes..7=domingo)", "business_hours.days");
  }
  const days = [...new Set(o.days.map((d) => {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 7) {
      throw new BusinessHoursValidationError("business_hours.days debe contener enteros 1-7", "business_hours.days");
    }
    return d;
  }))].sort((a, b) => a - b);

  const startHour = o.start_hour;
  const endHour = o.end_hour;
  if (typeof startHour !== "number" || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new BusinessHoursValidationError("business_hours.start_hour debe ser un entero 0-23", "business_hours.start_hour");
  }
  if (typeof endHour !== "number" || !Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    throw new BusinessHoursValidationError("business_hours.end_hour debe ser un entero 1-24", "business_hours.end_hour");
  }
  if (startHour >= endHour) {
    throw new BusinessHoursValidationError("business_hours.start_hour debe ser menor que end_hour", "business_hours.start_hour");
  }

  return { timezone, days, start_hour: startHour, end_hour: endHour };
}

/**
 * Offset UTC ("+HH:MM"/"-HH:MM") de `tz` en el instante `date`, correcto
 * para cualquier TZ IANA incluyendo DST — sin librería nueva. Usa
 * `timeZoneName: 'longOffset'` (ej. "GMT-03:00") en vez de intentar mapear
 * offsets fijos por zona (varias TZ los cambian según la época del año).
 */
export function getUtcOffsetString(tz: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /^GMT([+-]\d{2}:\d{2})$/.exec(raw);
  return m ? m[1] : "+00:00";
}

/**
 * Parsea un timestamp naive `DD/MM/YYYY HH:mm:ss` (formato de compatibilidad
 * con binarios de agente viejos, pre-ISO — el agente actual manda ISO-UTC
 * con `Z`) aplicando el offset UTC real de `tz` en el instante del propio
 * timestamp, no "ahora" — evita un error de 1h si el cloud procesa con
 * backlog un log/lectura escrito antes de una transición de DST. Devuelve
 * `null` si `raw` no matchea ese formato (el caller cae a `new Date(raw)`
 * para ISO/otros formatos).
 */
export function parseNaiveLocalTimestamp(raw: string, tz: string): Date | null {
  const dateMatch = /(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (!dateMatch) return null;
  const [, day, month, year] = dateMatch;
  const timePart = raw.split(" ")[1] || "00:00:00";
  const [hh, mm, ss] = timePart.split(":").map((n) => Number(n) || 0);
  const approxUtcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), hh, mm, ss);
  const offset = getUtcOffsetString(tz, new Date(approxUtcMs));
  return new Date(`${year}-${month}-${day}T${timePart}${offset}`);
}
