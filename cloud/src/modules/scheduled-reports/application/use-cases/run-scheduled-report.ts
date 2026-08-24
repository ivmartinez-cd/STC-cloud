import { computeNextRunAt, type ScheduledReport } from "../../domain/entities/scheduled-report";
import type { ScheduledReportRepository } from "../../domain/repositories/scheduled-report-repository";
import type { RenderedFile, ReportRenderer } from "../ports/report-renderer";
import type { ReportMailer } from "../ports/report-mailer";

function scheduleOf(report: ScheduledReport) {
  return {
    freq: report.scheduleFreq,
    dow: report.scheduleDow,
    dom: report.scheduleDom,
    hour: report.scheduleHour,
  };
}

async function renderFor(renderer: ReportRenderer, report: ScheduledReport): Promise<RenderedFile> {
  return renderer.render({
    reportType: report.reportType,
    reportName: report.name,
    clientId: report.clientId,
    filters: report.params,
    format: report.format,
  });
}

/** Genera el archivo sin enviarlo (para el endpoint de descarga). */
export async function renderScheduledReport(
  renderer: ReportRenderer,
  report: ScheduledReport
): Promise<RenderedFile> {
  return renderFor(renderer, report);
}

/**
 * Corre un informe: genera + envía + registra el resultado y la próxima
 * corrida. Un fallo de render/envío queda en `last_run_error` y NO frena
 * el resto de los informes del tick (el worker itera y captura por fila).
 */
async function renderAndSend(
  deps: { renderer: ReportRenderer; mailer: ReportMailer },
  report: ScheduledReport,
  now: Date
): Promise<void> {
  const file = await renderFor(deps.renderer, report);
  await deps.mailer.send({
    recipients: report.recipients,
    reportName: report.name,
    bodyText: `Informe: ${report.name}\nGenerado: ${now.toISOString()}\n\nSe adjunta el archivo.`,
    file,
  });
}

export async function executeScheduledReport(
  deps: { repo: ScheduledReportRepository; renderer: ReportRenderer; mailer: ReportMailer },
  report: ScheduledReport
): Promise<{ status: "ok" | "error"; error: string | null }> {
  const now = new Date();
  const nextRunAt = computeNextRunAt(scheduleOf(report), now);
  try {
    await renderAndSend(deps, report, now);
    await deps.repo.recordRun(report.id, { lastRunAt: now, lastRunStatus: "ok", lastRunError: null, nextRunAt });
    return { status: "ok", error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.repo.recordRun(report.id, { lastRunAt: now, lastRunStatus: "error", lastRunError: message, nextRunAt });
    return { status: "error", error: message };
  }
}
