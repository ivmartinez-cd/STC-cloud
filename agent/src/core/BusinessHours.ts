// === Business Hours Helper ===
// Horario laboral + TZ configurables por agente (§2.1/§3 R7 gap analysis).
// Sin config (agente sin actualizar, o cloud sin configurar): default
// hardcodeado de siempre — Mon-Fri 08:00-18:00 Argentina time — cero cambio
// de comportamiento.
//
// Los intervalos de los 4 loops de monitoreo (antes `INTERVALS`, definidos
// acá mismo) se movieron a `MonitorIntervals.ts` — dejaron de ser una
// constante fija: son personalizables por agente, con el mismo patrón que
// el horario laboral de abajo (`resolveIntervals()` allá es el equivalente
// de `isBusinessHours()` acá).

export interface BusinessHoursConfig {
  /** IANA TZ, ej. "America/Argentina/Buenos_Aires", "America/Santiago". */
  timezone: string;
  /** ISO weekday: 1=lunes .. 7=domingo. */
  days: number[];
  /** 0-23. */
  start_hour: number;
  /** 1-24. */
  end_hour: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: 'America/Argentina/Buenos_Aires',
  days: [1, 2, 3, 4, 5],
  start_hour: 8,
  end_hour: 18,
};

/** `Intl.DateTimeFormat` con locale 'en-US' devuelve abreviaturas fijas — mapeo a ISO weekday. */
const WEEKDAY_TO_ISO: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

/** `now` es inyectable para tests determinísticos — en producción siempre se omite (usa el instante real). */
export function isBusinessHours(config?: BusinessHoursConfig | null, now: Date = new Date()): boolean {
  const { timezone, days, start_hour, end_hour } = config ?? DEFAULT_BUSINESS_HOURS;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);

  const rawWeekday = (parts.find(p => p.type === 'weekday')?.value ?? '')
    .toLowerCase()
    .replace(/\.$/, '');

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);

  const isoDay = WEEKDAY_TO_ISO[rawWeekday];
  if (!isoDay || !days.includes(isoDay)) return false;
  return hour >= start_hour && hour < end_hour;
}
