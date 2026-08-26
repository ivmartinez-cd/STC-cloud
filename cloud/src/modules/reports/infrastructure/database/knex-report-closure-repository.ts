import type { Knex } from "knex";
import type { ReportClosure, ReportClosureLine } from "../../domain/entities/report-closure";
import type { PeriodUsageLine } from "../../domain/entities/period-usage-line";
import type { NewClosure, ReopenClosureInput, ReportClosureRepository } from "../../domain/repositories/report-closure-repository";

const CLOSURE_COLUMNS = [
  "id", "client_id", "period", "status",
  "closed_at", "closed_by", "reopened_at", "reopened_by", "reopen_reason",
  "superseded_by", "total_pages", "total_mono", "total_color", "total_other",
  "device_count", "anomalies_count",
];

// Postgres devuelve `bigint` como STRING vía el driver `pg` (evita perder
// precisión sobre Number.MAX_SAFE_INTEGER) — todas las columnas de deltas/
// totales/lecturas son `bigint`. Sin este cast, `toClosure`/`toLine` le
// mienten al tipo TS (`number`) y cualquier suma río abajo (PDF, tira de
// KPIs del portal) hace concatenación de strings en vez de aritmética. Bug
// real encontrado navegando Reportes de facturación con Playwright
// (handoff hifi #3, verificación post-fase-5) — `sumUsageTotals` ya
// casteaba con `Number()` al ESCRIBIR el cierre, pero re-leerlo de la base
// después volvía a traer strings.
function n(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function nOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function toClosure(r: any): ReportClosure {
  return {
    id: r.id, clientId: r.client_id, period: r.period, status: r.status,
    closedAt: r.closed_at, closedBy: r.closed_by, reopenedAt: r.reopened_at, reopenedBy: r.reopened_by,
    reopenReason: r.reopen_reason, supersededBy: r.superseded_by,
    totalPages: n(r.total_pages), totalMono: n(r.total_mono), totalColor: n(r.total_color), totalOther: n(r.total_other),
    deviceCount: n(r.device_count), anomaliesCount: n(r.anomalies_count),
  };
}

function toLine(r: any): ReportClosureLine {
  return {
    id: r.id, closureId: r.closure_id, deviceId: r.device_id, deviceSerial: r.device_serial,
    deviceModel: r.device_model, deviceBrand: r.device_brand, agentId: r.agent_id, agentName: r.agent_name,
    firstReadingAt: r.first_reading_at, firstTotalPages: nOrNull(r.first_total_pages),
    firstMonoPages: nOrNull(r.first_mono_pages), firstColorPages: nOrNull(r.first_color_pages),
    lastReadingAt: r.last_reading_at, lastTotalPages: nOrNull(r.last_total_pages),
    lastMonoPages: nOrNull(r.last_mono_pages), lastColorPages: nOrNull(r.last_color_pages),
    deltaTotal: n(r.delta_total), deltaMono: n(r.delta_mono), deltaColor: n(r.delta_color),
    deltaOther: n(r.delta_other), deltaEstimated: nOrNull(r.delta_estimated),
    source: r.source, hadCounterReset: r.had_counter_reset,
  };
}

function toLineRow(closureId: string, l: PeriodUsageLine) {
  return {
    closure_id: closureId, device_id: l.device_id, device_serial: l.serial_number, device_model: l.model,
    device_brand: l.brand, agent_id: l.agent_id, agent_name: l.agent_name,
    first_reading_at: l.first_reading_at, first_total_pages: l.first_total,
    first_mono_pages: l.first_mono, first_color_pages: l.first_color,
    last_reading_at: l.last_reading_at, last_total_pages: l.last_total,
    last_mono_pages: l.last_mono, last_color_pages: l.last_color,
    delta_total: l.delta_total, delta_mono: l.delta_mono, delta_color: l.delta_color,
    delta_other: l.delta_other, delta_estimated: l.delta_estimated,
    source: l.source, had_counter_reset: l.had_counter_reset,
  };
}

export class KnexReportClosureRepository implements ReportClosureRepository {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async findClosed(clientId: string, periodStart: Date): Promise<ReportClosure | null> {
    const row = await this.db("report_closures").where({ client_id: clientId, status: "closed" }).where("period", periodStart).first();
    return row ? toClosure(row) : null;
  }

  async findReopenedUnsuperseded(clientId: string, periodStart: Date): Promise<ReportClosure | null> {
    const row = await this.db("report_closures")
      .where({ client_id: clientId, status: "reopened" }).where("period", periodStart).whereNull("superseded_by").first();
    return row ? toClosure(row) : null;
  }

  async insertClosure(c: NewClosure): Promise<ReportClosure> {
    const [row] = await this.db("report_closures").insert({
      client_id: c.clientId, period: c.periodStart, status: "closed", closed_by: c.closedBy,
      total_pages: c.totalPages, total_mono: c.totalMono, total_color: c.totalColor, total_other: c.totalOther,
      device_count: c.deviceCount, anomalies_count: c.anomaliesCount,
    }).returning("*");
    return toClosure(row);
  }

  async insertLines(closureId: string, lines: PeriodUsageLine[]): Promise<void> {
    await this.db("report_closure_lines").insert(lines.map((l) => toLineRow(closureId, l)));
  }

  async markSuperseded(oldClosureId: string, newClosureId: string): Promise<void> {
    await this.db("report_closures").where({ id: oldClosureId }).update({ superseded_by: newClosureId });
  }

  async listByClient(clientId: string): Promise<ReportClosure[]> {
    const rows = await this.db("report_closures").where({ client_id: clientId }).orderBy("period", "desc").select(CLOSURE_COLUMNS);
    return rows.map(toClosure);
  }

  async findOwned(closureId: string, clientId: string): Promise<ReportClosure | null> {
    const row = await this.db("report_closures").where({ id: closureId, client_id: clientId }).first();
    return row ? toClosure(row) : null;
  }

  async findLines(closureId: string): Promise<ReportClosureLine[]> {
    const rows = await this.db("report_closure_lines").where({ closure_id: closureId }).orderBy("device_serial").select("*");
    return rows.map(toLine);
  }

  async reopen(closureId: string, input: ReopenClosureInput): Promise<ReportClosure | null> {
    const [row] = await this.db("report_closures").where({ id: closureId })
      .update({ status: "reopened", reopened_at: new Date(), reopened_by: input.reopenedBy, reopen_reason: input.reason })
      .returning("*");
    return row ? toClosure(row) : null;
  }

  async findClientName(clientId: string): Promise<string | null> {
    const row = await this.db("clients").where({ id: clientId }).select("name").first();
    return row?.name ?? null;
  }
}
