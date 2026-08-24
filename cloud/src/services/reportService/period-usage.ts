import { Knex } from "knex";

export interface PeriodUsageLine {
  device_id: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  agent_id: string | null;
  agent_name: string | null;
  source: string | null;
  first_reading_at: Date | null;
  first_total: number | null;
  first_mono: number | null;
  first_color: number | null;
  last_reading_at: Date | null;
  last_total: number | null;
  last_mono: number | null;
  last_color: number | null;
  delta_total: number;
  delta_mono: number;
  delta_color: number;
  had_counter_reset: boolean;
}

/** Parsea "YYYY-MM" a los límites [inicio, fin) del mes calendario, en UTC. */
export function parsePeriod(period: string): { periodStart: Date; periodEnd: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error("Período inválido, se espera YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  if (month < 1 || month > 12) throw new Error("Período inválido, se espera YYYY-MM");
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  return { periodStart, periodEnd };
}

/** "YYYY-MM" a partir de un `period` (columna `date`, primer día del mes). */
export function formatPeriod(periodDate: Date): string {
  const d = new Date(periodDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Volumen del período por dispositivo, para un cliente. No escribe nada — la usan
 * tanto el preview como `closePeriod` (que persiste exactamente lo que esto
 * devuelve). Incluye dispositivos vía `devices.client_id` directo (identidad de
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
export async function computePeriodUsage(
  db: Knex,
  params: { clientId: string; period: string }
): Promise<PeriodUsageLine[]> {
  const { clientId, period } = params;
  const { periodStart, periodEnd } = parsePeriod(period);

  const result = await db.raw(
    `
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
      (res.device_id IS NOT NULL) AS had_counter_reset
    FROM scoped_devices sd
    LEFT JOIN first_reading fr ON fr.device_id = sd.device_id
    LEFT JOIN last_reading  lr ON lr.device_id = sd.device_id
    LEFT JOIN deltas_sum    ds ON ds.device_id = sd.device_id
    LEFT JOIN resets       res ON res.device_id = sd.device_id
    ORDER BY sd.serial_number NULLS LAST
    `,
    [clientId, periodStart, periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd]
  );

  return result.rows as PeriodUsageLine[];
}
