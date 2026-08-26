import type {
  ReportFormat,
  ReportType,
  ScheduledReport,
  ScheduleFreq,
} from "../../domain/entities/scheduled-report";
import type { ReportTemplate } from "../../domain/entities/report-templates";

/**
 * DTOs del contrato HTTP (snake_case como el resto de la API del portal —
 * mismo criterio que el módulo feedback: el dominio interno usa camelCase,
 * la frontera preserva el estilo del resto de la API).
 */
export interface ScheduledReportInputDto {
  client_id?: string | null;
  name: string;
  report_type: ReportType;
  params?: Record<string, unknown>;
  format?: ReportFormat;
  schedule_freq?: ScheduleFreq;
  schedule_dow?: number | null;
  schedule_dom?: number | null;
  schedule_hour?: number;
  recipients?: string[];
  enabled?: boolean;
}

export interface ScheduledReportViewDto {
  id: string;
  client_id: string | null;
  name: string;
  report_type: ReportType;
  params: Record<string, unknown>;
  format: ReportFormat;
  schedule_freq: ScheduleFreq;
  schedule_dow: number | null;
  schedule_dom: number | null;
  schedule_hour: number;
  recipients: string[];
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  created_at: string;
}

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

function definitionView(r: ScheduledReport) {
  return {
    id: r.id,
    client_id: r.clientId,
    name: r.name,
    report_type: r.reportType,
    params: r.params,
    format: r.format,
    recipients: r.recipients,
    enabled: r.enabled,
    created_at: new Date(r.createdAt).toISOString(),
  };
}

function scheduleView(r: ScheduledReport) {
  return {
    schedule_freq: r.scheduleFreq,
    schedule_dow: r.scheduleDow,
    schedule_dom: r.scheduleDom,
    schedule_hour: r.scheduleHour,
    next_run_at: iso(r.nextRunAt),
    last_run_at: iso(r.lastRunAt),
    last_run_status: r.lastRunStatus,
    last_run_error: r.lastRunError,
  };
}

export function toViewDto(r: ScheduledReport): ScheduledReportViewDto {
  return { ...definitionView(r), ...scheduleView(r) };
}

export function toTemplateView(t: ReportTemplate) {
  return {
    report_type: t.reportType,
    label: t.label,
    description: t.description,
    default_format: t.defaultFormat,
    default_params: t.defaultParams,
    suggested_frequency: t.suggestedFrequency,
  };
}
