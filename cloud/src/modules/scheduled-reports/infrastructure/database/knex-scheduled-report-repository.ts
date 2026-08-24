import type { Knex } from "knex";
import type { ScheduledReport } from "../../domain/entities/scheduled-report";
import type {
  RunResultWrite,
  ScheduledReportRepository,
  ScheduledReportWrite,
} from "../../domain/repositories/scheduled-report-repository";

const TABLE = "scheduled_reports";

/* eslint-disable @typescript-eslint/no-explicit-any */
function entityDefinition(row: any) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    reportType: row.report_type,
    params: row.params ?? {},
    format: row.format,
    recipients: row.recipients ?? [],
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entitySchedule(row: any) {
  return {
    scheduleFreq: row.schedule_freq,
    scheduleDow: row.schedule_dow,
    scheduleDom: row.schedule_dom,
    scheduleHour: row.schedule_hour,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunError: row.last_run_error,
  };
}

function toEntity(row: any): ScheduledReport {
  return { ...entityDefinition(row), ...entitySchedule(row) };
}

function toRow(data: ScheduledReportWrite): Record<string, unknown> {
  return {
    client_id: data.clientId,
    name: data.name,
    report_type: data.reportType,
    params: JSON.stringify(data.params),
    format: data.format,
    schedule_freq: data.scheduleFreq,
    schedule_dow: data.scheduleDow,
    schedule_dom: data.scheduleDom,
    schedule_hour: data.scheduleHour,
    recipients: JSON.stringify(data.recipients),
    enabled: data.enabled,
    next_run_at: data.nextRunAt,
    updated_at: new Date(),
  };
}

export class KnexScheduledReportRepository implements ScheduledReportRepository {
  constructor(private readonly db: Knex) {}

  async list(): Promise<ScheduledReport[]> {
    const rows = await this.db(TABLE).orderBy("created_at", "desc");
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ScheduledReport | null> {
    const row = await this.db(TABLE).where({ id }).first();
    return row ? toEntity(row) : null;
  }

  async create(data: ScheduledReportWrite, createdBy: string | null): Promise<ScheduledReport> {
    const [row] = await this.db(TABLE)
      .insert({ ...toRow(data), created_by: createdBy })
      .returning("*");
    return toEntity(row);
  }

  async update(id: string, data: ScheduledReportWrite): Promise<ScheduledReport | null> {
    const [row] = await this.db(TABLE).where({ id }).update(toRow(data)).returning("*");
    return row ? toEntity(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db(TABLE).where({ id }).delete();
    return count > 0;
  }

  async listDue(now: Date): Promise<ScheduledReport[]> {
    const rows = await this.db(TABLE)
      .where("enabled", true)
      .whereNot("schedule_freq", "none")
      .where("next_run_at", "<=", now);
    return rows.map(toEntity);
  }

  async recordRun(id: string, result: RunResultWrite): Promise<void> {
    await this.db(TABLE).where({ id }).update({
      last_run_at: result.lastRunAt,
      last_run_status: result.lastRunStatus,
      last_run_error: result.lastRunError,
      next_run_at: result.nextRunAt,
      updated_at: new Date(),
    });
  }
}
