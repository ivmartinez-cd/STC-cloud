import type { Knex } from "knex";
import type { ClientMonitorRow, ClientUsageMonth } from "../../../domain/entities/client";

export function listClientMonitors(db: Knex, clientId: string, includeIpRanges: boolean): Promise<ClientMonitorRow[]> {
  return db("agents")
    .where("agents.client_id", clientId)
    .select(
      "agents.id", "agents.name", "agents.status", "agents.last_seen", "agents.hardware_id",
      "agents.host_name", "agents.scan_interval_minutes",
      ...(includeIpRanges ? ["agents.ip_ranges"] : []),
      db.raw("COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS device_count")
    )
    .leftJoin("devices as d", "d.agent_id", "agents.id")
    .groupBy("agents.id")
    .orderBy("agents.name");
}

// Suma de deltas positivos entre lecturas consecutivas por dispositivo (no MAX-MIN
// del mes): un reset/decremento de contador no debe inflar ni romper el volumen.
// El CTE calcula deltas sobre una ventana extendida 40 días atrás de los 12 meses
// mostrados, para que el primer delta de cada mes tome como base la última
// lectura del mes anterior; el filtro por mes se aplica después, sobre la fecha
// de la lectura actual (no sobre la que se usa como base).
//
// Ventana 12 meses (no 4): handoff hifi "Cliente — detalle" (25/08/2026) — "Consumo
// mensual" pide 12 barras con el mes actual destacado. La ventana de 4 meses era la
// causa real del bug "hoy ilegible (una barra)" que describe el README: con un
// cliente de prueba que sólo tiene lecturas recientes, 4 meses de ventana devolvía
// 1 sola fila (el resto sin lecturas en ese corte), y el front (recharts) con una
// sola categoría en el eje X se ve como "una barra" — no era un bug de cómo el
// front grafica, sino la ventana angosta pidiendo menos meses de los que el
// diseño necesita. `ClientUsageChart.tsx` además tenía un bug real aparte (barras
// apiladas mono/color en vez de una sola por mes, sin destacar el mes actual) —
// corregido en el front, ver ese archivo.
const USAGE_BY_MONTH_SQL = `
    WITH deltas AS (
      SELECT
        r.time,
        r.mono_pages  - LAG(r.mono_pages)  OVER (PARTITION BY r.device_id ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS color_delta
      FROM readings r
      JOIN devices d ON r.device_id = d.id
      WHERE d.client_id = ?
        AND d.merged_into IS NULL
        AND r.time >= date_trunc('month', NOW() - INTERVAL '11 months') - INTERVAL '40 days'
    )
    SELECT
      to_char(date_trunc('month', time), 'Mon YYYY') AS month,
      date_trunc('month', time) AS month_date,
      SUM(GREATEST(mono_delta, 0))::int  as mono,
      SUM(GREATEST(color_delta, 0))::int as color
    FROM deltas
    WHERE time >= date_trunc('month', NOW() - INTERVAL '11 months')
    GROUP BY date_trunc('month', time)
    ORDER BY month_date ASC
`;

export async function usageByMonth(db: Knex, clientId: string): Promise<ClientUsageMonth[]> {
  const result = await db.raw(USAGE_BY_MONTH_SQL, [clientId]);
  return result.rows as ClientUsageMonth[];
}
