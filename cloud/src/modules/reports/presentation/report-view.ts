import type { ReportClosure, ReportClosureLine } from "../domain/entities/report-closure";
import type { ClosureDetail } from "../application/dtos/report-dtos";

// Contrato de wire snake_case preservado tal cual lo consumía ya el portal
// (`types/reports.ts`) — el dominio interno usa camelCase, esta es la
// traducción explícita en el borde del sistema.

export function toClosureView(c: ReportClosure) {
  return {
    id: c.id,
    client_id: c.clientId,
    period: c.period,
    status: c.status,
    closed_at: c.closedAt,
    closed_by: c.closedBy,
    reopened_at: c.reopenedAt,
    reopened_by: c.reopenedBy,
    reopen_reason: c.reopenReason,
    superseded_by: c.supersededBy,
    total_pages: c.totalPages,
    total_mono: c.totalMono,
    total_color: c.totalColor,
    total_other: c.totalOther,
    device_count: c.deviceCount,
    anomalies_count: c.anomaliesCount,
  };
}

export function toClosureLineView(l: ReportClosureLine) {
  return {
    id: l.id,
    closure_id: l.closureId,
    device_id: l.deviceId,
    device_serial: l.deviceSerial,
    device_model: l.deviceModel,
    device_brand: l.deviceBrand,
    agent_id: l.agentId,
    agent_name: l.agentName,
    first_reading_at: l.firstReadingAt,
    first_total_pages: l.firstTotalPages,
    first_mono_pages: l.firstMonoPages,
    first_color_pages: l.firstColorPages,
    last_reading_at: l.lastReadingAt,
    last_total_pages: l.lastTotalPages,
    last_mono_pages: l.lastMonoPages,
    last_color_pages: l.lastColorPages,
    delta_total: l.deltaTotal,
    delta_mono: l.deltaMono,
    delta_color: l.deltaColor,
    delta_other: l.deltaOther,
    delta_estimated: l.deltaEstimated,
    source: l.source,
    had_counter_reset: l.hadCounterReset,
  };
}

export function toClosureDetailView(d: ClosureDetail) {
  return { ...toClosureView(d.closure), lines: d.lines.map(toClosureLineView) };
}
