import type { Knex } from "knex";

/**
 * Historia del panel de control — la tabla que le falta al modelo para poder
 * dibujar tendencia (handoff "Panel de control", 16/09/2026: delta vs. ayer +
 * sparkline de 7 días en cada KPI, columna de variación en las tablas).
 *
 * Por qué una tabla y no derivarlo al vuelo: de las cuatro cifras del titular,
 * sólo "alertas activas" es reconstruible hacia atrás (`alerts.created_at` +
 * `resolved_at` dicen si una alerta estaba abierta en cualquier instante
 * pasado). Las otras tres — parque gestionado (`devices.monitor_state`),
 * monitores en línea (`agents.last_seen`) y consumibles en alerta
 * (`devices.supplies_details`) — son columnas de estado ACTUAL, sin historia:
 * hoy valen lo que valen y nadie guardó lo que valían ayer. Inventarles una
 * curva sería dibujar un dato que no existe, así que se empieza a medir.
 *
 * Forma: una toma por hora y por cliente. El total global es la suma sobre los
 * clientes del scope (todo lo que se mide es client-scoped: `devices.client_id`
 * es NOT NULL desde `20260822050000`, y `agents.client_id` también), así que no
 * hace falta una fila "global" con `client_id` nulo — que además obligaría a un
 * índice único con NULLS NOT DISTINCT (PG15+) para no duplicarse.
 *
 * Los contadores son NULLABLE a propósito: `NULL` es "esa toma no midió esto",
 * que es exactamente el caso del backfill de abajo. El lector trata un bucket
 * con cualquier `NULL` como bucket sin dato para esa métrica y el portal no
 * dibuja sparkline — en vez de contar un 0 que nunca se midió.
 *
 * `alerts_by_class` va como jsonb `{clase: cantidad}` y no como tabla hija: es
 * el desglose que ya consume el panel (`/dashboard.alertsByClass`), se lee
 * entero siempre, y la clasificación en críticas/advertencias/informativas la
 * sigue haciendo el portal — la misma agrupación de 3 tonos que hoy vive en
 * `AlertsByClassSection`, ahora compartida en `lib/alert-tiers.ts`.
 *
 * Backfill: 30 días de "alertas abiertas por clase", hora a hora, reconstruidos
 * desde `alerts`. Es real, no estimado. Las otras columnas quedan `NULL` en esas
 * filas — sus sparklines arrancan vacías y se llenan solas a medida que el job
 * corre. Retención: 90 días, purgada por `retentionJob.ts`.
 */

const BACKFILL_SQL = `
  INSERT INTO dashboard_snapshots (at, client_id, alerts_by_class)
  SELECT
    b.at,
    c.id,
    COALESCE(
      (
        SELECT jsonb_object_agg(x.alert_class, x.n)
        FROM (
          SELECT COALESCE(a.alert_class, 'other') AS alert_class, COUNT(*)::int AS n
          FROM alerts a
          LEFT JOIN devices d ON d.id = a.device_id
          LEFT JOIN agents g ON g.id = COALESCE(d.agent_id, a.agent_id)
          WHERE (d.id IS NULL OR d.merged_into IS NULL)
            -- Misma regla de propiedad que whereClientOwns() en
            -- knex-alert-repository.ts: manda el cliente del equipo y, para
            -- las alertas agent-scoped (sin equipo), el del agente.
            AND (d.client_id = c.id OR (d.id IS NULL AND g.client_id = c.id))
            AND a.created_at <= b.at
            AND (a.resolved_at IS NULL OR a.resolved_at > b.at)
          GROUP BY 1
        ) x
      ),
      '{}'::jsonb
    )
  FROM clients c
  CROSS JOIN generate_series(
    date_trunc('hour', now()) - interval '30 days',
    date_trunc('hour', now()),
    interval '1 hour'
  ) AS b(at)
  ON CONFLICT (client_id, at) DO NOTHING
`;

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("dashboard_snapshots")) return;

  await knex.schema.createTable("dashboard_snapshots", (t) => {
    t.timestamp("at", { useTz: true }).notNullable();
    t.uuid("client_id").notNullable().references("id").inTable("clients").onDelete("CASCADE");
    t.jsonb("alerts_by_class").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.integer("devices_total").nullable();
    t.integer("devices_managed").nullable();
    t.integer("agents_total").nullable();
    t.integer("agents_online").nullable();
    t.integer("supplies_critical").nullable();
    t.integer("supplies_low").nullable();
    t.primary(["client_id", "at"]);
  });

  // El lector siempre barre por ventana de tiempo sobre todos los clientes del
  // scope; la PK (client_id, at) no sirve para eso.
  await knex.schema.alterTable("dashboard_snapshots", (t) => {
    t.index(["at"], "dashboard_snapshots_at_idx");
  });

  await knex.raw(BACKFILL_SQL);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dashboard_snapshots");
}
