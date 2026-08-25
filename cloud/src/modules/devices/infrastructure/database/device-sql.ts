// Self-join de pares vivos del mismo cliente, por MAC, por IP-fantasma en
// la misma sede, o por serial coincidente entre monitores distintos (el
// caso que motiva la clave por cliente en primer lugar).
//
// `a_brand`/`a_model`/`a_name`/`b_*` y `detected_at` (25/08/2026): el handoff hifi
// "Cliente — detalle" muestra el par como "HP LaserJet M428 ↔ HP LaserJet M428fdw"
// (marca+modelo, no serie cruda) + antigüedad de la coincidencia — columnas nuevas,
// aditivas, no cambian el shape que ya consume `DuplicateDevicesCard.tsx`/
// `MergeDeviceModal.tsx` (siguen usando sólo `a_serial`/`a_ip`/`a_mac`/`reason`).
export const DUPLICATES_SQL = (byAgent: boolean) => `SELECT a.id AS a_id, a.serial_number AS a_serial, a.mac AS a_mac, a.ip_address AS a_ip,
            a.agent_id AS a_agent_id, a.last_seen AS a_last_seen,
            a.brand AS a_brand, a.model AS a_model, a.name AS a_name,
            b.id AS b_id, b.serial_number AS b_serial, b.mac AS b_mac, b.ip_address AS b_ip,
            b.agent_id AS b_agent_id, b.last_seen AS b_last_seen,
            b.brand AS b_brand, b.model AS b_model, b.name AS b_name,
            LEAST(a.created_at, b.created_at) AS detected_at,
            CASE
              WHEN a.mac IS NOT NULL AND a.mac = b.mac THEN 'same_mac'
              WHEN a.agent_id = b.agent_id AND a.ip_address = b.ip_address
                AND (a.serial_number IS NULL OR a.serial_number = host(a.ip_address)
                     OR b.serial_number IS NULL OR b.serial_number = host(b.ip_address))
                THEN 'ghost_same_ip'
              WHEN upper(btrim(a.serial_number)) = upper(btrim(b.serial_number)) AND a.agent_id <> b.agent_id
                THEN 'same_serial_different_monitor'
              ELSE 'same_hostname'
            END AS reason
       FROM devices a JOIN devices b ON a.id < b.id
      WHERE a.client_id = ? AND b.client_id = ?
        AND a.decommissioned_at IS NULL AND a.merged_into IS NULL
        AND b.decommissioned_at IS NULL AND b.merged_into IS NULL
        AND (
          (a.mac IS NOT NULL AND a.mac = b.mac)
          OR (a.agent_id = b.agent_id AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address)
          OR (a.serial_number IS NOT NULL AND upper(btrim(a.serial_number)) = upper(btrim(b.serial_number)))
          OR (a.hostname IS NOT NULL AND a.hostname = b.hostname)
        )
        ${byAgent ? "AND (a.agent_id = ? OR b.agent_id = ?)" : ""}
      LIMIT 200`;

export function duplicatesBindings(clientId: string, agentId?: string): string[] {
  return agentId ? [clientId, clientId, agentId, agentId] : [clientId, clientId];
}

// Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del mes ni
// `last(total_pages)` de los agregados continuos): un reset/decremento de
// contador no debe inflar el mes, y el ÚLTIMO acumulado del mes NO es el
// volumen de ese mes. Adaptado de `USAGE_BY_MONTH_SQL`
// (modules/clients/infrastructure/database/knex-client-repository.ts) a un
// solo dispositivo. Ventana extendida 40 días antes de los 12 meses mostrados
// para que el primer delta de cada mes tenga como base la última lectura del
// mes anterior — sin ese pre-roll el mes más viejo de la ventana no tiene
// `LAG` y se lee como 0. `generate_series` rellena los 12 buckets en el
// servidor: un equipo con 2 meses de historia real igual devuelve 12 filas
// (el resto en 0) — el front nunca rellena huecos.
//
// Invariante que este SQL garantiza (handoff: "la serie mensual no puede sumar
// más que el contador de vida del equipo"): los 12 meses son disjuntos y
// consecutivos, así que Σ de deltas positivos de toda la ventana ≤ (último
// acumulado − primero) ≤ `devices.mono_pages`/`color_pages`, que guardan
// justamente el último acumulado. Único borde: un reset de contador DENTRO de
// la ventana puede hacer que la suma de deltas positivos supere la columna
// post-reset — se documenta acá en vez de clampearse en silencio (ya existe
// una alerta `counter_reset` para ese caso).
export const PRINT_TREND_SQL = `
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now() - INTERVAL '11 months'),
        date_trunc('month', now()),
        INTERVAL '1 month'
      ) AS month_date
    ), deltas AS (
      SELECT
        r.time,
        r.mono_pages  - LAG(r.mono_pages)  OVER (ORDER BY r.time) AS mono_delta,
        r.color_pages - LAG(r.color_pages) OVER (ORDER BY r.time) AS color_delta
      FROM readings r
      WHERE r.device_id = ?
        AND r.time >= date_trunc('month', now() - INTERVAL '11 months') - INTERVAL '40 days'
    ), agg AS (
      SELECT
        date_trunc('month', time) AS month_date,
        SUM(GREATEST(mono_delta, 0))::int  AS mono,
        SUM(GREATEST(color_delta, 0))::int AS color
      FROM deltas
      WHERE time >= date_trunc('month', now() - INTERVAL '11 months')
      GROUP BY 1
    )
    SELECT
      to_char(m.month_date, 'YYYY-MM') AS month,
      m.month_date,
      COALESCE(a.mono, 0)  AS mono,
      COALESCE(a.color, 0) AS color,
      COALESCE(a.mono, 0) + COALESCE(a.color, 0) AS total
    FROM months m
    LEFT JOIN agg a USING (month_date)
    ORDER BY m.month_date ASC
`;

// Volumen del mes corriente de ESTE dispositivo, mismo patrón de delta que
// arriba pero acotado al mes en curso (no 12 meses).
export const DEVICE_MONTH_VOLUME_SQL = `
  SELECT COALESCE(SUM(GREATEST(total_delta, 0)), 0)::int AS volume_month
  FROM (
    SELECT r.time, r.total_pages - LAG(r.total_pages) OVER (ORDER BY r.time) AS total_delta
    FROM readings r
    WHERE r.device_id = ?
      AND r.time >= date_trunc('month', now()) - INTERVAL '40 days'
  ) x
  WHERE time >= date_trunc('month', now())
`;

// Mismo cálculo que `volume_month` de la tira de métricas del monitor
// (`monthlyVolumeForAgent` en knex-agent-portal-repository.ts) pero para el
// AGENTE dueño de `?` (subselect) — reusar el predicado exacto asegura que el
// "% del sitio" de esta pantalla nunca pueda contradecir el "volumen del mes"
// que ya muestra la pantalla de Monitor para el mismo sitio.
export const SITE_MONTH_VOLUME_SQL = `
  SELECT COALESCE(SUM(GREATEST(total_delta, 0)), 0)::int AS site_volume_month
  FROM (
    SELECT r.time, r.total_pages - LAG(r.total_pages) OVER (PARTITION BY r.device_id ORDER BY r.time) AS total_delta
    FROM readings r
    WHERE r.device_id IN (
        SELECT id FROM devices
        WHERE agent_id = (SELECT agent_id FROM devices WHERE id = ?) AND merged_into IS NULL
      )
      AND r.time >= date_trunc('month', now()) - INTERVAL '40 days'
  ) x
  WHERE time >= date_trunc('month', now())
`;

// Atascos de los últimos 30 días — clase `jam` ya clasificada por
// `alert-catalog.ts`. `last_jam_message` alimenta `extractTrayLabel()`.
export const DEVICE_JAMS_30D_SQL = `
  SELECT
    COUNT(*)::int AS jams_30d,
    MAX(created_at) AS last_jam_at,
    (ARRAY_AGG(message ORDER BY created_at DESC))[1] AS last_jam_message
  FROM alerts
  WHERE device_id = ? AND alert_class = 'jam' AND created_at >= now() - INTERVAL '30 days'
`;
