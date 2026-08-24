import type { Knex } from "knex";
import type {
  RenderedFile,
  RenderedTable,
  ReportRenderer,
} from "../../application/ports/report-renderer";
import type { ReportFormat, ReportType } from "../../domain/entities/scheduled-report";
import { encodeTable } from "./tabular-export";
import { assetListTable, nonContactableTable } from "./device-tables";
import {
  alertHistoryTable,
  consumableLevelsTable,
  usageTable,
} from "./usage-supplies-alerts-tables";

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function optNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

interface TableParams {
  title: string;
  clientId: string | null;
  f: Record<string, unknown>;
}

type TableBuilder = (db: Knex, p: TableParams) => Promise<RenderedTable>;

const BUILDERS: Record<ReportType, TableBuilder> = {
  usage: (db, { title, clientId, f }) =>
    usageTable(db, { title, clientId, period: typeof f.period === "string" ? f.period : undefined }),
  non_contactable: (db, { title, clientId, f }) =>
    nonContactableTable(db, { title, clientId, offlineDays: num(f.offline_days, 3) }),
  consumable_levels: (db, { title, clientId, f }) =>
    consumableLevelsTable(db, { title, clientId, maxPercentage: optNum(f.max_percentage), maxDays: optNum(f.max_days) }),
  asset_list: (db, { title, clientId }) => assetListTable(db, { title, clientId }),
  alert_history: (db, { title, clientId, f }) =>
    alertHistoryTable(db, {
      title, clientId, days: num(f.days, 7),
      alertClass: typeof f.alert_class === "string" ? f.alert_class : undefined,
    }),
};

/** Implementación del puerto ReportRenderer: despacha por tipo y codifica. */
export class KnexReportRenderer implements ReportRenderer {
  constructor(private readonly db: Knex) {}

  async render(params: {
    reportType: ReportType;
    reportName: string;
    clientId: string | null;
    filters: Record<string, unknown>;
    format: ReportFormat;
  }): Promise<RenderedFile> {
    const build = BUILDERS[params.reportType];
    const table = await build(this.db, { title: params.reportName, clientId: params.clientId, f: params.filters });
    return encodeTable(table, params.format);
  }
}
