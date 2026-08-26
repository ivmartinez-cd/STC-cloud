import type { Knex } from "knex";

/**
 * Cierre de gap post-verificación del handoff hifi #3 (26/08/2026):
 * "Cierre de facturación" y "Auditoría de accesos" pasan a tener un
 * `ReportType` real (`billing_closure`/`audit_export`, ver
 * `report-templates.ts`) — el CHECK constraint de `20260824100000_
 * scheduled_reports.ts` sólo permitía los 5 tipos originales.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE scheduled_reports DROP CONSTRAINT scheduled_reports_type_check;
    ALTER TABLE scheduled_reports ADD CONSTRAINT scheduled_reports_type_check CHECK (report_type IN
      ('usage','non_contactable','consumable_levels','asset_list','alert_history','billing_closure','audit_export'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE scheduled_reports DROP CONSTRAINT scheduled_reports_type_check;
    ALTER TABLE scheduled_reports ADD CONSTRAINT scheduled_reports_type_check CHECK (report_type IN
      ('usage','non_contactable','consumable_levels','asset_list','alert_history'))
  `);
}
