// Self-join de pares vivos del mismo cliente, por MAC, por IP en el mismo
// monitor, o por serial coincidente entre monitores distintos (el caso que
// motiva la clave por cliente en primer lugar).
//
// `a_brand`/`a_model`/`a_name`/`b_*` y `detected_at` (25/08/2026): el handoff hifi
// "Cliente — detalle" muestra el par como "HP LaserJet M428 ↔ HP LaserJet M428fdw"
// (marca+modelo, no serie cruda) + antigüedad de la coincidencia — columnas nuevas,
// aditivas, no cambian el shape que ya consume `DuplicateDevicesCard.tsx`/
// `MergeDeviceModal.tsx` (siguen usando sólo `a_serial`/`a_ip`/`a_mac`/`reason`).
//
// Guardas (27/08/2026, auditoría contra la flota real): dos equipos con seriales
// identificantes DISTINTOS son dos impresoras físicas distintas, se parezcan en lo
// que se parezcan — la coincidencia de hostname (las HP reportan el modelo como
// hostname por defecto: 6 "HP LaserJet E50145" distintas producían 15 pares
// falsos) o de IP (DHCP reasigna la misma IP a otro equipo en días distintos)
// no las convierte en duplicado. La única excepción es la MAC: dos filas con la
// misma MAC física y seriales distintos son la misma impresora con un serial mal
// leído (caso real: HP M428fdw con serial "Z5MAB…" de una versión vieja del
// agente) — ésa sí se muestra. Un hostname igual al modelo no cuenta como
// coincidencia por sí solo. El predicado de serial identificante es el mismo
// de `devices_client_serial_uniq` / `isIdentifyingSerial` (device-identity.ts).
const IDENTIFYING_SERIAL_SQL = (t: string) =>
  `(${t}.serial_number IS NOT NULL AND length(btrim(${t}.serial_number)) >= 5
     AND (${t}.ip_address IS NULL OR btrim(${t}.serial_number) <> host(${t}.ip_address))
     AND btrim(${t}.serial_number) !~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$'
     AND btrim(${t}.serial_number) !~ '^(.)\\1*$'
     AND btrim(${t}.serial_number) !~* '^(unknown|n/\\?a|none|null|nil|serial|s/\\?n|not \\?set|default)$'
     AND btrim(${t}.serial_number) !~* '^(sn)\\?0*123456[0-9]*$')`;

const DISTINCT_IDENTIFYING_SERIALS_SQL =
  `(${IDENTIFYING_SERIAL_SQL("a")} AND ${IDENTIFYING_SERIAL_SQL("b")}
     AND upper(btrim(a.serial_number)) <> upper(btrim(b.serial_number)))`;

/**
 * "Misma MAC" sólo cuenta si la MAC identifica algo. Hay firmware que reporta
 * una MAC de relleno (HP 604CDD en ISSN: tres equipos distintos, tres
 * seriales, tres IPs, todos con `00:00:f0:a0:00:00`), y eso generaba tres
 * "pares duplicados" que no eran. Una MAC física no puede estar en más de un
 * equipo vivo a la vez; se toleran dos (el caso real: serial mal leído sobre
 * la misma placa) y a partir del tercero se la trata como relleno.
 */
const SAME_MAC_SQL = `(a.mac IS NOT NULL AND a.mac = b.mac
     AND a.mac !~* '^(00:00:00:00:00:00|ff:ff:ff:ff:ff:ff)$'
     AND (SELECT count(*) FROM devices m
            WHERE m.client_id = a.client_id AND m.mac = a.mac
              AND m.decommissioned_at IS NULL AND m.merged_into IS NULL) <= 2)`;

const HOSTNAME_MATCH_SQL =
  `(a.hostname IS NOT NULL AND btrim(a.hostname) <> '' AND lower(btrim(a.hostname)) = lower(btrim(b.hostname))
     AND lower(btrim(a.hostname)) <> lower(btrim(coalesce(a.model, '')))
     AND lower(btrim(b.hostname)) <> lower(btrim(coalesce(b.model, ''))))`;

export const DUPLICATES_SQL = (byAgent: boolean) => `SELECT a.id AS a_id, a.serial_number AS a_serial, a.mac AS a_mac, a.ip_address AS a_ip,
            a.agent_id AS a_agent_id, a.last_seen AS a_last_seen,
            a.brand AS a_brand, a.model AS a_model, a.name AS a_name, a.hostname AS a_hostname,
            b.id AS b_id, b.serial_number AS b_serial, b.mac AS b_mac, b.ip_address AS b_ip,
            b.agent_id AS b_agent_id, b.last_seen AS b_last_seen,
            b.brand AS b_brand, b.model AS b_model, b.name AS b_name, b.hostname AS b_hostname,
            LEAST(a.created_at, b.created_at) AS detected_at,
            CASE
              WHEN ${SAME_MAC_SQL} THEN 'same_mac'
              WHEN a.serial_number IS NOT NULL AND upper(btrim(a.serial_number)) = upper(btrim(b.serial_number))
                AND a.agent_id <> b.agent_id
                THEN 'same_serial_different_monitor'
              WHEN a.agent_id = b.agent_id AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address
                AND (NOT ${IDENTIFYING_SERIAL_SQL("a")} OR NOT ${IDENTIFYING_SERIAL_SQL("b")})
                THEN 'ghost_same_ip'
              WHEN a.agent_id = b.agent_id AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address
                THEN 'same_ip'
              ELSE 'same_hostname'
            END AS reason
       FROM devices a JOIN devices b ON a.id < b.id
      WHERE a.client_id = ? AND b.client_id = ?
        AND a.decommissioned_at IS NULL AND a.merged_into IS NULL
        AND b.decommissioned_at IS NULL AND b.merged_into IS NULL
        AND (
          ${SAME_MAC_SQL}
          OR (NOT ${DISTINCT_IDENTIFYING_SERIALS_SQL} AND (
               (a.agent_id = b.agent_id AND a.ip_address IS NOT NULL AND a.ip_address = b.ip_address)
            OR (a.serial_number IS NOT NULL AND upper(btrim(a.serial_number)) = upper(btrim(b.serial_number)))
            OR ${HOSTNAME_MATCH_SQL}
          ))
        )
        ${byAgent ? "AND (a.agent_id = ? OR b.agent_id = ?)" : ""}
      ORDER BY detected_at DESC
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
