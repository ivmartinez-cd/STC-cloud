import knex from "knex";
import knexConfig from "../db/knexfile";
import { logger } from "../logger";
import { runGuardedTick } from "../modules/observability/guarded-tick";
import { KnexScheduledReportRepository } from "../modules/scheduled-reports/infrastructure/database/knex-scheduled-report-repository";
import { KnexReportRenderer } from "../modules/scheduled-reports/infrastructure/renderers/knex-report-renderer";
import { SmtpReportMailer } from "../modules/scheduled-reports/infrastructure/mail/smtp-report-mailer";
import { executeScheduledReport } from "../modules/scheduled-reports/application/use-cases/run-scheduled-report";

/**
 * Ejecutor de informes programados (Fase 4.1 del gap analysis vs HP SDS).
 * `setInterval` a propósito, mismo criterio que `heartbeatMonitor.ts`/
 * `incidentWorker.ts` — un solo `api` service sin réplicas, no hace falta
 * cola para evitar doble disparo. 1 min de tick: la granularidad de la
 * programación es la hora, así que el peor caso de demora es irrelevante,
 * pero un tick corto hace que "corré esto ahora" vía `next_run_at` vencido
 * se sienta inmediato. La query del tick usa el índice parcial
 * `scheduled_reports_due_idx` (enabled + programado + vencido).
 */
const INTERVAL_MS = 60_000;

const db = knex(knexConfig.development);
const repo = new KnexScheduledReportRepository(db);
const deps = { repo, renderer: new KnexReportRenderer(db), mailer: new SmtpReportMailer(db) };

let running = false;

export async function tick(): Promise<void> {
  if (running) return; // un tick largo (SMTP lento) no debe apilarse con el siguiente
  running = true;
  try {
    // Lock multi-réplica + métricas + Sentry — Fase 5.3 (el catch vive en el wrapper).
    await runGuardedTick(db, "scheduled-reports", async () => {
      const due = await repo.listDue(new Date());
      for (const report of due) {
        const result = await executeScheduledReport(deps, report);
        if (result.status === "error") {
          logger.error({ reportId: report.id, error: result.error }, "[ScheduledReports] fallo al ejecutar informe");
        } else {
          logger.info({ reportId: report.id, name: report.name }, "[ScheduledReports] informe enviado");
        }
      }
    });
  } finally {
    running = false;
  }
}

setInterval(() => void tick(), INTERVAL_MS);
logger.info("[ScheduledReports] worker iniciado (tick cada 60s)");
