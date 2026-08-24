import type { ScheduledReport } from "../entities/scheduled-report";

/** Campos que acepta un alta/edición (el resto los administra el sistema). */
export interface ScheduledReportWrite {
  clientId: string | null;
  name: string;
  reportType: ScheduledReport["reportType"];
  params: Record<string, unknown>;
  format: ScheduledReport["format"];
  scheduleFreq: ScheduledReport["scheduleFreq"];
  scheduleDow: number | null;
  scheduleDom: number | null;
  scheduleHour: number;
  recipients: string[];
  enabled: boolean;
  nextRunAt: Date | null;
}

export interface RunResultWrite {
  lastRunAt: Date;
  lastRunStatus: "ok" | "error";
  lastRunError: string | null;
  nextRunAt: Date | null;
}

export interface ScheduledReportRepository {
  list(): Promise<ScheduledReport[]>;
  findById(id: string): Promise<ScheduledReport | null>;
  create(data: ScheduledReportWrite, createdBy: string | null): Promise<ScheduledReport>;
  update(id: string, data: ScheduledReportWrite): Promise<ScheduledReport | null>;
  delete(id: string): Promise<boolean>;
  /** Filas habilitadas y programadas cuya próxima corrida ya venció. */
  listDue(now: Date): Promise<ScheduledReport[]>;
  recordRun(id: string, result: RunResultWrite): Promise<void>;
}
