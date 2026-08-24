import type { Knex } from "knex";

/**
 * Fase 4.1 del gap analysis vs HP SDS (re-comparación 24/08/2026,
 * docs/dev/STC_Gap_Analysis_vs_HP_SDS_2026-08.md): informes guardados y
 * programados con entrega por email — el equivalente de "Informes
 * configurados" del SDS (55 filas reales en uso allá). La definición vive
 * acá (tipo + filtros + frecuencia + destinatarios); la ejecución la hace
 * `cloud/src/jobs/scheduledReportsWorker.ts` reutilizando los renderers del
 * módulo `cloud/src/modules/scheduled-reports/`.
 *
 * `next_run_at` se precomputa al guardar (dominio puro,
 * `computeNextRunAt`) para que el worker haga una sola query barata por
 * tick (`enabled AND next_run_at <= now()`), en vez de evaluar la regla de
 * frecuencia de cada fila cada minuto.
 *
 * Zona horaria: `schedule_hour` es hora local del servidor (TZ del
 * contenedor). El modelo multi-país por usuario es R7 del doc y queda
 * explícitamente fuera de este ítem.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasTable("scheduled_reports");
  if (has) return;

  await knex.schema.createTable("scheduled_reports", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    // NULL = informe global (todos los clientes) — solo admin/operator ven esto.
    t.uuid("client_id").nullable().references("id").inTable("clients").onDelete("CASCADE");
    t.string("name", 120).notNullable();
    t.text("report_type").notNullable();
    t.jsonb("params").notNullable().defaultTo("{}");
    t.text("format").notNullable().defaultTo("xlsx");
    t.text("schedule_freq").notNullable().defaultTo("none");
    t.integer("schedule_dow").nullable(); // 0=domingo..6=sábado (weekly)
    t.integer("schedule_dom").nullable(); // 1..28 (monthly)
    t.integer("schedule_hour").notNullable().defaultTo(8);
    t.jsonb("recipients").notNullable().defaultTo("[]");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("next_run_at", { useTz: true }).nullable();
    t.timestamp("last_run_at", { useTz: true }).nullable();
    t.text("last_run_status").nullable(); // 'ok' | 'error'
    t.text("last_run_error").nullable();
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE scheduled_reports
      ADD CONSTRAINT scheduled_reports_type_check CHECK (report_type IN
        ('usage','non_contactable','consumable_levels','asset_list','alert_history')),
      ADD CONSTRAINT scheduled_reports_format_check CHECK (format IN ('csv','xlsx')),
      ADD CONSTRAINT scheduled_reports_freq_check CHECK (schedule_freq IN
        ('none','daily','weekdays','weekly','monthly')),
      ADD CONSTRAINT scheduled_reports_hour_check CHECK (schedule_hour BETWEEN 0 AND 23),
      ADD CONSTRAINT scheduled_reports_dow_check CHECK (schedule_dow IS NULL OR schedule_dow BETWEEN 0 AND 6),
      ADD CONSTRAINT scheduled_reports_dom_check CHECK (schedule_dom IS NULL OR schedule_dom BETWEEN 1 AND 28)
  `);

  // La query del worker: filas habilitadas con próxima corrida vencida.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS scheduled_reports_due_idx
      ON scheduled_reports (next_run_at)
      WHERE enabled = true AND schedule_freq <> 'none'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scheduled_reports");
}
