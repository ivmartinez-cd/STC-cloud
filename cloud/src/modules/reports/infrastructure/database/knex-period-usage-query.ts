import type { Knex } from "knex";
import type { PeriodUsageLine } from "../../domain/entities/period-usage-line";
import type { PeriodUsageQuery } from "../../domain/repositories/period-usage-query";
import { parsePeriod } from "../../domain/services/period";

/**
 * Incluye dispositivos vía `devices.client_id` directo (identidad de
 * dispositivo por cliente, §2.4) — un equipo reasignado a otro cliente después
 * del período no se reatribuye retroactivamente, sigue el `client_id` ACTUAL.
 *
 * Regla de baja: un equipo dado de baja a mitad del período SÍ aparece en el
 * cierre de ESE mes (imprimió esas páginas, excluirlas regala volumen y rompe
 * la conciliación contra el contador físico) pero NO en los siguientes — de ahí
 * el filtro `decommissioned_at IS NULL OR decommissioned_at >= periodStart`. Sin
 * él, como las líneas se arman con LEFT JOIN, cada cierre arrastraría para
 * siempre todas las bajas históricas del cliente con delta 0. Las fusiones
 * (`merged_into`) se excluyen siempre: su historial ya vive en la fila
 * superviviente.
 */
const PERIOD_USAGE_SQL = `
    WITH scoped_devices AS (
      SELECT d.id AS device_id, d.serial_number, d.model, d.brand, d.agent_id,
             a.name AS agent_name, d.poll_method
      FROM devices d
      LEFT JOIN agents a ON a.id = d.agent_id
      WHERE d.client_id = ?
        AND d.merged_into IS NULL
        AND (d.decommissioned_at IS NULL OR d.decommissioned_at >= ?::date)
        -- Fase 5 del gap analysis vs HP SDS: un equipo 'supplies_only'/'disabled'
        -- no factura (mismo espíritu que billableDevices en deviceFilters.ts,
        -- reescrito acá en SQL crudo porque esta función arma todo con
        -- db.raw()). A diferencia de decommissioned_at, no hay historial de
        -- CUÁNDO cambió monitor_state dentro del período — se usa el estado
        -- ACTUAL, así que un cambio a mitad de mes afecta el cierre completo,
        -- no sólo los días posteriores al cambio (limitación conocida, sin
        -- historial no hay forma más precisa).
        AND d.monitor_state IN ('full', 'reports_only')
        -- Fase 7 del gap analysis vs HP SDS: un equipo todavía 'pending' (o
        -- ya 'ignored') tampoco factura, mismo espíritu que onlyLiveDevices/
        -- billableDevices en deviceFilters.ts.
        AND d.registration_state = 'registered'
    ),
    -- Ventana extendida 40 días atrás del inicio del período (mismo criterio que
    -- dashboardController/getClientUsage): el LAG del primer registro DENTRO del
    -- período necesita ver la última lectura del mes anterior como base.
    deltas AS (
      SELECT
        r.device_id, r.time, r.total_pages, r.mono_pages, r.color_pages,
        r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS total_delta,
        r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
      FROM readings r
      JOIN scoped_devices sd ON sd.device_id = r.device_id
      WHERE r.time >= ?::date - INTERVAL '40 days' AND r.time < ?::date
    ),
    period_only AS (
      SELECT * FROM deltas WHERE time >= ?::date AND time < ?::date
    ),
    first_reading AS (
      SELECT DISTINCT ON (device_id) device_id, time AS first_reading_at,
             total_pages AS first_total, mono_pages AS first_mono, color_pages AS first_color
      FROM period_only ORDER BY device_id, time ASC
    ),
    last_reading AS (
      SELECT DISTINCT ON (device_id) device_id, time AS last_reading_at,
             total_pages AS last_total, mono_pages AS last_mono, color_pages AS last_color
      FROM period_only ORDER BY device_id, time DESC
    ),
    -- Suma de deltas POSITIVOS, no "last - first": un reset a mitad de mes daría
    -- un número negativo/erróneo con last-first; esta es la misma cuenta que ya
    -- usa el resto del código para no inflar/romper la facturación.
    deltas_sum AS (
      SELECT device_id,
        SUM(GREATEST(total_delta, 0))::bigint AS delta_total,
        SUM(GREATEST(mono_delta,  0))::bigint AS delta_mono,
        SUM(GREATEST(color_delta, 0))::bigint AS delta_color
      FROM period_only
      WHERE total_delta IS NOT NULL
      GROUP BY device_id
    ),
    resets AS (
      SELECT DISTINCT device_id FROM alerts
      WHERE type = 'counter_reset' AND device_id IS NOT NULL
        AND created_at >= ?::date AND created_at < ?::date
    )
    SELECT
      sd.device_id, sd.serial_number, sd.model, sd.brand, sd.agent_id, sd.agent_name,
      sd.poll_method AS source,
      fr.first_reading_at, fr.first_total, fr.first_mono, fr.first_color,
      lr.last_reading_at, lr.last_total, lr.last_mono, lr.last_color,
      COALESCE(ds.delta_total, 0) AS delta_total,
      COALESCE(ds.delta_mono,  0) AS delta_mono,
      COALESCE(ds.delta_color, 0) AS delta_color,
      -- Residuo explícito (bug real, fase 5 del handoff hifi #3): las tres
      -- SUM(GREATEST(x,0)) de arriba son independientes, nada garantiza que
      -- total = mono + color. Esta resta hace que la igualdad cierre SIEMPRE,
      -- por construcción, en vez de asumir un invariante que el dato crudo
      -- no respeta.
      (COALESCE(ds.delta_total, 0) - COALESCE(ds.delta_mono, 0) - COALESCE(ds.delta_color, 0)) AS delta_other,
      (res.device_id IS NOT NULL) AS had_counter_reset
    FROM scoped_devices sd
    LEFT JOIN first_reading fr ON fr.device_id = sd.device_id
    LEFT JOIN last_reading  lr ON lr.device_id = sd.device_id
    LEFT JOIN deltas_sum    ds ON ds.device_id = sd.device_id
    LEFT JOIN resets       res ON res.device_id = sd.device_id
    ORDER BY sd.serial_number NULLS LAST
`;

// Ventana de historia "limpia" para estimar — 90 días antes del período,
// nunca DENTRO de él (esos son justo los datos que el reset volvió
// inconfiables). Promedio de deltas diarios POSITIVOS (mismo criterio
// GREATEST-y-descartar-negativos que el resto del módulo) extrapolado a los
// días del período — es una estimación honesta, no una reconstrucción
// exacta: si no hay historia previa suficiente, da 0, nunca un número
// inventado.
const RESET_ESTIMATE_HISTORY_DAYS = 90;

const RESET_ESTIMATE_SQL = `
  SELECT COALESCE(AVG(daily_delta), 0) AS avg_daily
  FROM (
    SELECT total_pages - LAG(total_pages) OVER (ORDER BY day) AS daily_delta
    FROM readings_daily_agg
    WHERE device_id = ? AND day >= ?::date - (? || ' days')::interval AND day < ?::date
  ) d
  WHERE daily_delta >= 0
`;

export class KnexPeriodUsageQuery implements PeriodUsageQuery {
  constructor(private readonly db: Knex | Knex.Transaction) {}

  async compute(clientId: string, period: string): Promise<PeriodUsageLine[]> {
    const { periodStart, periodEnd } = parsePeriod(period);
    const result = await this.db.raw(PERIOD_USAGE_SQL, [
      clientId, periodStart, periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd,
    ]);
    const lines = result.rows as PeriodUsageLine[];
    const days = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
    await Promise.all(
      lines.filter((l) => l.had_counter_reset).map(async (l) => {
        l.delta_estimated = await this.estimateResetDelta(l.device_id, periodStart, days);
      })
    );
    for (const l of lines) if (l.delta_estimated === undefined) l.delta_estimated = null;
    return lines;
  }

  private async estimateResetDelta(deviceId: string, periodStart: Date, days: number): Promise<number> {
    const { rows } = await this.db.raw(RESET_ESTIMATE_SQL, [deviceId, periodStart, RESET_ESTIMATE_HISTORY_DAYS, periodStart]);
    const avgDaily = Number(rows[0]?.avg_daily ?? 0);
    return Math.round(avgDaily * days);
  }
}
