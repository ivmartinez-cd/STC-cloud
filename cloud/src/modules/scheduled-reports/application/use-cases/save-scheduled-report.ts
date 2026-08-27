import { computeNextRunAt, type ScheduledReport, type ScheduleFreq } from "../../domain/entities/scheduled-report";
import type {
  ScheduledReportRepository,
  ScheduledReportWrite,
} from "../../domain/repositories/scheduled-report-repository";
import type { ScheduledReportInputDto } from "../dtos/scheduled-report-dtos";
import { ValidationError } from "../../../../shared/domain/errors";

export class ScheduledReportValidationError extends ValidationError {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;

function validatedRecipients(input: ScheduledReportInputDto): string[] {
  const recipients = input.recipients ?? [];
  if (recipients.length > MAX_RECIPIENTS) {
    throw new ScheduledReportValidationError(`Máximo ${MAX_RECIPIENTS} destinatarios`);
  }
  for (const r of recipients) {
    if (!EMAIL_RE.test(r)) throw new ScheduledReportValidationError(`Email inválido: ${r}`);
  }
  return recipients;
}

function scheduleOf(input: ScheduledReportInputDto, recipients: string[]) {
  const freq = input.schedule_freq ?? "none";
  if (freq !== "none" && recipients.length === 0) {
    throw new ScheduledReportValidationError("Un informe programado necesita al menos un destinatario");
  }
  return {
    freq,
    dow: input.schedule_dow ?? null,
    dom: input.schedule_dom ?? null,
    hour: input.schedule_hour ?? 8,
  };
}

function toWrite(input: ScheduledReportInputDto, now: Date): ScheduledReportWrite {
  const recipients = validatedRecipients(input);
  const schedule = scheduleOf(input, recipients);
  return {
    clientId: input.client_id ?? null,
    name: input.name.trim(),
    reportType: input.report_type,
    params: input.params ?? {},
    format: input.format ?? "xlsx",
    scheduleFreq: schedule.freq,
    scheduleDow: schedule.dow,
    scheduleDom: schedule.dom,
    scheduleHour: schedule.hour,
    recipients,
    enabled: input.enabled ?? true,
    nextRunAt: computeNextRunAt(schedule, now),
  };
}

export async function createScheduledReport(
  repo: ScheduledReportRepository,
  input: ScheduledReportInputDto,
  createdBy: string | null
): Promise<ScheduledReport> {
  return repo.create(toWrite(input, new Date()), createdBy);
}

export async function updateScheduledReport(
  repo: ScheduledReportRepository,
  id: string,
  input: ScheduledReportInputDto
): Promise<ScheduledReport | null> {
  return repo.update(id, toWrite(input, new Date()));
}

function inputFromExisting(r: ScheduledReport): ScheduledReportInputDto {
  return {
    client_id: r.clientId, name: `${r.name} (copia)`, report_type: r.reportType, params: r.params, format: r.format,
    schedule_freq: r.scheduleFreq as ScheduleFreq, schedule_dow: r.scheduleDow, schedule_dom: r.scheduleDom,
    schedule_hour: r.scheduleHour, recipients: r.recipients,
    // La copia arranca deshabilitada — evita duplicar envíos automáticos sin que
    // el operador la revise primero (mismo criterio que "duplicar" en otras
    // pantallas del handoff, ej. reglas de incidentes: nunca clona activo).
    enabled: false,
  };
}

/** "Duplicar informe" (Informes → Tus informes) — cierre de gap post-
 * verificación del handoff hifi #3, 26/08/2026. Clona la definición
 * entera server-side; no reusa el `id` original ni copia el historial de
 * corridas (`last_run_*` arrancan en null, como cualquier informe nuevo). */
export async function duplicateScheduledReport(
  repo: ScheduledReportRepository,
  id: string,
  createdBy: string | null
): Promise<ScheduledReport | null> {
  const existing = await repo.findById(id);
  if (!existing) return null;
  return repo.create(toWrite(inputFromExisting(existing), new Date()), createdBy);
}
