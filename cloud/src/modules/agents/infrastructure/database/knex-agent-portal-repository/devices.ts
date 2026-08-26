import type { Knex } from "knex";
import { onlyLiveDevices } from "../../../../../api/utils/deviceFilters";

// Volumen mensual por suma de deltas positivos (no MAX-MIN), ventana extendida
// 40 días, filtrando por los equipos de ESTE agente dentro de la subconsulta.
const MONTHLY_SUBQUERY = `
    (
      SELECT
        device_id,
        SUM(GREATEST(total_pages_delta, 0))::int AS monthly_pages,
        SUM(GREATEST(mono_pages_delta,  0))::int AS monthly_mono,
        SUM(GREATEST(color_pages_delta, 0))::int AS monthly_color
      FROM (
        SELECT
          device_id,
          time,
          total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta,
          mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY time) AS mono_pages_delta,
          color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY time) AS color_pages_delta
        FROM readings
        WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
          AND device_id IN (SELECT id FROM devices WHERE agent_id = ? AND merged_into IS NULL)
      ) deltas
      WHERE time >= date_trunc('month', now())
      GROUP BY device_id
    ) as m
`;

/** Techo de seguridad (R9 gap analysis vs HP SDS) — no tenía límite alguno; ver el mismo criterio en `KnexClientRepository.listDevices`. */
export function listAgentDevices(db: Knex | Knex.Transaction, agentId: string, includeDecommissioned: boolean): Promise<unknown[]> {
  return db("devices").where("devices.agent_id", agentId)
    .modify((q) => { if (!includeDecommissioned) onlyLiveDevices(q, "devices"); else q.whereNull("devices.merged_into"); })
    .leftJoin(db.raw(MONTHLY_SUBQUERY, [agentId]), "m.device_id", "devices.id")
    .leftJoin("device_usage_30d as u30", "u30.device_id", "devices.id")
    .leftJoin("device_models as dm", function () {
      this.on(db.raw("lower(dm.brand) = lower(devices.brand)")).andOn(db.raw("dm.model_key = lower(btrim(devices.model))"));
    })
    .select(
      "devices.*",
      db.raw("COALESCE(m.monthly_pages, 0) AS monthly_pages"), db.raw("COALESCE(m.monthly_mono,  0) AS monthly_mono"),
      db.raw("COALESCE(m.monthly_color, 0) AS monthly_color"), db.raw("COALESCE(u30.pages_30d, 0) AS pages_30d"),
      db.raw("COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) as duty_cycle_effective"),
      db.raw(`
      CASE WHEN COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) > 0
           THEN round(100.0 * COALESCE(u30.pages_30d, 0) / COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly))
      END as utilization_pct
    `)
    )
    .orderBy("devices.brand")
    .limit(1000);
}
