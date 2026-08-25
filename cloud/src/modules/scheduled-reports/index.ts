import type { Knex } from "knex";
import { KnexScheduledReportRepository } from "./infrastructure/database/knex-scheduled-report-repository";
import { KnexReportRenderer } from "./infrastructure/renderers/knex-report-renderer";
import { SmtpReportMailer } from "./infrastructure/mail/smtp-report-mailer";
import { executeScheduledReport } from "./application/use-cases/run-scheduled-report";
import type { ScheduledReport } from "./domain/entities/scheduled-report";

/**
 * Facade del módulo `scheduled-reports`. `jobs/scheduledReportsWorker.ts` sólo
 * necesita "qué informes vencieron" y "ejecutá este"; el cableado de repo +
 * renderer + mailer sobre Knex/SMTP queda acá.
 */
export type { ScheduledReport } from "./domain/entities/scheduled-report";
export { registerScheduledReportRoutes } from "./presentation/scheduled-report-routes";

export interface ScheduledReportRunner {
  listDue(now: Date): Promise<ScheduledReport[]>;
  execute(report: ScheduledReport): ReturnType<typeof executeScheduledReport>;
}

export function createScheduledReportRunner(db: Knex): ScheduledReportRunner {
  const repo = new KnexScheduledReportRepository(db);
  const deps = { repo, renderer: new KnexReportRenderer(db), mailer: new SmtpReportMailer(db) };
  return {
    listDue: (now) => repo.listDue(now),
    execute: (report) => executeScheduledReport(deps, report),
  };
}
