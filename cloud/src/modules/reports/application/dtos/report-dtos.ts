import type { ReportClosure, ReportClosureLine } from "../../domain/entities/report-closure";
import type { PeriodUsageLine } from "../../domain/entities/period-usage-line";

export interface PreviewPeriodInput {
  clientId: string;
  /** "YYYY-MM". */
  period: string;
}

export interface PreviewPeriodResult {
  period: string;
  lines: PeriodUsageLine[];
}

export interface ClosePeriodInput {
  clientId: string;
  period: string;
  userId: string | null;
  ipAddress: string;
}

export interface ReopenPeriodInput {
  clientId: string;
  closureId: string;
  userId: string | null;
  reason: string | null;
  ipAddress: string;
}

export interface ClosureLookupInput {
  clientId: string;
  closureId: string;
}

export interface ClosureDetail {
  closure: ReportClosure;
  lines: ReportClosureLine[];
}

export type ExportFormat = "csv" | "xlsx";

export interface ExportClosureInput extends ClosureLookupInput {
  format: ExportFormat;
}

export interface ExportedFile {
  filename: string;
  contentType: string;
  body: string | Buffer;
}
