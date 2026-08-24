import { computeNextRunAt, type ScheduledReport } from "../../domain/entities/scheduled-report";
import type {
  ScheduledReportRepository,
  ScheduledReportWrite,
} from "../../domain/repositories/scheduled-report-repository";
import type { ScheduledReportInputDto } from "../dtos/scheduled-report-dtos";

export class ScheduledReportValidationError extends Error {}

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
