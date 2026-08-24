/**
 * Entidad del dominio "informe programado" (Fase 4.1 del gap analysis vs
 * HP SDS). Puro: sin Knex/Fastify/fechas del sistema — `computeNextRunAt`
 * recibe el "ahora" como parámetro para ser testeable de forma determinista.
 */

export const REPORT_TYPES = [
  "usage",
  "non_contactable",
  "consumable_levels",
  "asset_list",
  "alert_history",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["csv", "xlsx"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const SCHEDULE_FREQS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type ScheduleFreq = (typeof SCHEDULE_FREQS)[number];

export interface ScheduledReport {
  id: string;
  clientId: string | null;
  name: string;
  reportType: ReportType;
  params: Record<string, unknown>;
  format: ReportFormat;
  scheduleFreq: ScheduleFreq;
  scheduleDow: number | null;
  scheduleDom: number | null;
  scheduleHour: number;
  recipients: string[];
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function atHour(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextDaily(from: Date, hour: number, weekdaysOnly: boolean): Date {
  let candidate = atHour(from, hour);
  while (candidate <= from || (weekdaysOnly && (candidate.getDay() === 0 || candidate.getDay() === 6))) {
    candidate = atHour(new Date(candidate.getTime() + 24 * 3600 * 1000), hour);
  }
  return candidate;
}

function nextWeekly(from: Date, hour: number, dow: number): Date {
  let candidate = atHour(from, hour);
  while (candidate <= from || candidate.getDay() !== dow) {
    candidate = atHour(new Date(candidate.getTime() + 24 * 3600 * 1000), hour);
  }
  return candidate;
}

function nextMonthly(from: Date, hour: number, dom: number): Date {
  const inMonth = (y: number, m: number) => atHour(new Date(y, m, dom), hour);
  let candidate = inMonth(from.getFullYear(), from.getMonth());
  if (candidate <= from) candidate = inMonth(from.getFullYear(), from.getMonth() + 1);
  return candidate;
}

/**
 * Próxima corrida ESTRICTAMENTE posterior a `from`, en hora local del
 * servidor (la decisión de TZ está documentada en la migración
 * `20260824100000_scheduled_reports.ts`). `dom` se limita a 1..28 por CHECK
 * de la base, así que nunca cae en un mes sin ese día.
 */
export function computeNextRunAt(
  schedule: { freq: ScheduleFreq; dow: number | null; dom: number | null; hour: number },
  from: Date
): Date | null {
  switch (schedule.freq) {
    case "none":
      return null;
    case "daily":
      return nextDaily(from, schedule.hour, false);
    case "weekdays":
      return nextDaily(from, schedule.hour, true);
    case "weekly":
      return nextWeekly(from, schedule.hour, schedule.dow ?? 1);
    case "monthly":
      return nextMonthly(from, schedule.hour, schedule.dom ?? 1);
  }
}
