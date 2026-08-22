import type { Knex } from "knex";

/**
 * Fase B (dedupe + flip de índice) de "identidad de dispositivo por cliente"
 * (§2.4). Requiere que la Fase 2 de código ya haya reemplazado el `ON CONFLICT
 * (agent_id, serial_number)` de `agentService.registerDevices` — si esta
 * migración creara el índice único nuevo mientras ese código siguiera
 * dependiendo del viejo, el INSERT explotaría con un 23505 del índice nuevo
 * que el try/catch de `registerDevices` traga en silencio.
 *
 * IMPORTANTE: el predicado de "serial identificante" de abajo REPLICA
 * `deviceIdentity.isIdentifyingSerial()` — si se toca uno, tocar el otro.
 */
export async function up(knex: Knex): Promise<void> {
  // 0. Re-backfill de client_id: filas creadas por código viejo en la ventana
  //    de deploy (en Render las migraciones corren en el buildCommand, antes
  //    de que el código nuevo esté sirviendo).
  await knex.raw(`
    UPDATE devices d SET client_id = a.client_id
      FROM agents a WHERE a.id = d.agent_id AND d.client_id IS NULL
  `);

  // 1. Universo de seriales IDENTIFICANTES (replica isIdentifyingSerial()).
  await knex.raw(`DROP TABLE IF EXISTS _dedupe_ident`);
  await knex.raw(`
    CREATE TEMP TABLE _dedupe_ident AS
    SELECT d.id, d.client_id, d.agent_id, d.mac, d.model, d.created_at, d.last_seen,
           upper(btrim(d.serial_number)) AS skey
      FROM devices d
     WHERE d.client_id IS NOT NULL
       AND d.merged_into IS NULL
       AND d.serial_number IS NOT NULL
       AND btrim(d.serial_number) <> ''
       AND length(btrim(d.serial_number)) >= 5
       AND (d.ip_address IS NULL OR btrim(d.serial_number) <> host(d.ip_address))
       AND btrim(d.serial_number) !~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$'
       AND btrim(d.serial_number) !~ '^(.)\\1*$'
       AND btrim(d.serial_number) !~* '^(unknown|n/?a|none|null|nil|serial|s/?n|not ?set|default)$'
       AND btrim(d.serial_number) !~* '^(sn)?0*123456[0-9]*$'
  `);

  // 2. Grupos duplicados de (client_id, skey), separando auto-fusionables de
  //    dudosos. Criterio conservador: se auto-fusiona sólo si TODAS las MAC
  //    conocidas del grupo coinciden (o hay a lo sumo una) y hay un solo
  //    modelo. Dos MAC distintas con el mismo serial = casi seguro dos
  //    impresoras distintas con un serial genérico que la denylist no cubrió.
  await knex.raw(`DROP TABLE IF EXISTS _dedupe_grp`);
  await knex.raw(`
    CREATE TEMP TABLE _dedupe_grp AS
    SELECT client_id, skey, count(*) AS n,
           count(DISTINCT mac::text) FILTER (WHERE mac IS NOT NULL) AS n_macs,
           count(DISTINCT lower(coalesce(model,''))) AS n_models,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
      FROM _dedupe_ident GROUP BY client_id, skey HAVING count(*) > 1
  `);

  const { rows: [conflictCount] } = await knex.raw(`
    SELECT count(*)::int AS n FROM _dedupe_grp WHERE n_macs > 1 OR n_models > 1
  `);

  // Registrar los dudosos en la bitácora, sin tocarlos.
  await knex.raw(`
    INSERT INTO device_merge_candidates (client_id, serial_key, device_ids, reason)
    SELECT client_id, skey, ids, CASE WHEN n_macs > 1 THEN 'multiple_macs' ELSE 'multiple_models' END
      FROM _dedupe_grp WHERE n_macs > 1 OR n_models > 1
    ON CONFLICT (client_id, serial_key) WHERE resolved_at IS NULL DO NOTHING
  `);

  // 3. Mapa dup -> keep para los grupos LIMPIOS únicamente. Superviviente =
  //    created_at más viejo (mismo criterio que 20260511000008).
  await knex.raw(`DROP TABLE IF EXISTS _dedupe_map`);
  await knex.raw(`
    CREATE TEMP TABLE _dedupe_map AS
    SELECT (g.ids)[1] AS keep_id, unnest(g.ids[2:array_length(g.ids,1)]) AS dup_id
      FROM _dedupe_grp g WHERE g.n_macs <= 1 AND g.n_models <= 1
  `);

  const { rows: dedupeRows } = await knex.raw(`SELECT keep_id, dup_id FROM _dedupe_map`);

  for (const { keep_id, dup_id } of dedupeRows) {
    // Promoción de identidad al superviviente (COALESCE de nulos, GREATEST de
    // contadores — nunca a la baja, dispararía un counter_reset espurio).
    await knex.raw(
      `
      UPDATE devices k SET
        mac = COALESCE(k.mac, d.mac),
        hostname = COALESCE(k.hostname, d.hostname),
        location_reported = COALESCE(k.location_reported, d.location_reported),
        firmware = COALESCE(k.firmware, d.firmware),
        sku = COALESCE(k.sku, d.sku),
        total_pages = GREATEST(COALESCE(k.total_pages,0), COALESCE(d.total_pages,0)),
        mono_pages  = GREATEST(COALESCE(k.mono_pages,0),  COALESCE(d.mono_pages,0)),
        color_pages = GREATEST(COALESCE(k.color_pages,0), COALESCE(d.color_pages,0)),
        last_seen = GREATEST(COALESCE(k.last_seen, to_timestamp(0)), COALESCE(d.last_seen, to_timestamp(0)))
      FROM devices d WHERE k.id = ? AND d.id = ?
    `,
      [keep_id, dup_id]
    );

    // alerts: resolver colisiones por tipo antes de reapuntar (índice único
    // parcial (device_id,type) WHERE resolved=false).
    await knex.raw(
      `
      WITH ranked AS (
        SELECT id, row_number() OVER (PARTITION BY type ORDER BY created_at ASC, id ASC) AS rn
          FROM alerts WHERE device_id IN (?, ?) AND resolved = false
      )
      UPDATE alerts SET resolved = true, resolved_at = now()
        FROM ranked WHERE alerts.id = ranked.id AND ranked.rn > 1
    `,
      [keep_id, dup_id]
    );
    await knex.raw(`UPDATE alerts SET device_id = ? WHERE device_id = ?`, [keep_id, dup_id]);

    // report_closure_lines: reapuntar, nunca tocar los números congelados.
    await knex.raw(`UPDATE report_closure_lines SET device_id = ? WHERE device_id = ?`, [keep_id, dup_id]);

    // monthly_counters: fantasma del STC legado — reapuntar si existiera, nunca borrar.
    const hasMonthlyCounters = await knex.schema.hasTable("monthly_counters");
    if (hasMonthlyCounters) {
      await knex.raw(`UPDATE monthly_counters SET device_id = ? WHERE device_id = ?`, [keep_id, dup_id]);
    }

    // readings: el paso caro (hypertable comprimido) — CON assert de conteo.
    const { rows: [pre] } = await knex.raw(`SELECT count(*)::bigint AS n FROM readings WHERE device_id = ?`, [dup_id]);
    const expected = Number(pre.n);
    const moved = await knex.raw(`UPDATE readings SET device_id = ? WHERE device_id = ?`, [keep_id, dup_id]);
    if (Number(moved.rowCount) !== expected) {
      throw new Error(`[dedupe] readings movidas ${moved.rowCount} != esperadas ${expected} para dup_id=${dup_id} — abortando`);
    }

    // Lápida — NUNCA DELETE.
    await knex.raw(
      `UPDATE devices SET merged_into = ?, merged_at = now(), active = false WHERE id = ?`,
      [keep_id, dup_id]
    );

    await knex.raw(
      `
      INSERT INTO audit_logs (action, target_id, user_id, ip_address, metadata)
      VALUES ('DEVICE_MERGED', ?, NULL, NULL, ?)
    `,
      [
        String(keep_id),
        JSON.stringify({ reason: "dedupe_migration", merged_id: dup_id }),
      ]
    );
  }

  await knex.raw(`DROP TABLE IF EXISTS _dedupe_map`);
  await knex.raw(`DROP TABLE IF EXISTS _dedupe_grp`);
  await knex.raw(`DROP TABLE IF EXISTS _dedupe_ident`);

  // 4. Índice único CONDICIONAL. Si quedaron conflictos sin resolver, NO se
  //    tira: server.ts corre migrate.latest() al bootear y un throw acá
  //    tumbaría el arranque (y con él, la ingesta del agente productivo). Se
  //    loguea y se registra en audit_logs — el determinismo mientras tanto lo
  //    garantiza la escalera de deviceIdentity.ts (corta si hay 2+ filas), no
  //    este constraint.
  const remainingConflicts = Number(conflictCount?.n ?? 0);
  if (remainingConflicts === 0) {
    // El predicado REPLICA deviceIdentity.isIdentifyingSerial(): un serial
    // genérico/no-identificante (repetido, IP-like, placeholder de firmware)
    // no debe competir por unicidad — dos impresoras distintas que reportan
    // el mismo "000000000" son casos reales, no un conflicto (encontrado por
    // un test de integración: una segunda impresora con serial genérico en
    // el mismo cliente violaba este índice con un 23505, silenciado por el
    // try/catch de la ingesta — la segunda lectura se perdía sin error visible).
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS devices_client_serial_uniq
        ON devices (client_id, upper(btrim(serial_number)))
        WHERE serial_number IS NOT NULL
          AND btrim(serial_number) <> ''
          AND merged_into IS NULL
          AND length(btrim(serial_number)) >= 5
          AND (ip_address IS NULL OR btrim(serial_number) <> host(ip_address))
          AND btrim(serial_number) !~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$'
          AND btrim(serial_number) !~ '^(.)\\1*$'
          AND btrim(serial_number) !~* '^(unknown|n/?a|none|null|nil|serial|s/?n|not ?set|default)$'
          AND btrim(serial_number) !~* '^(sn)?0*123456[0-9]*$'
    `);
    await knex.raw(`DROP INDEX IF EXISTS devices_client_serial_idx`);
    console.log("[MIGRATION] devices_client_serial_uniq creado sin conflictos pendientes.");
  } else {
    console.warn(
      `[MIGRATION] devices_client_serial_uniq DIFERIDO: ${remainingConflicts} grupo(s) en device_merge_candidates sin resolver.`
    );
    await knex.raw(`
      INSERT INTO audit_logs (action, target_id, metadata)
      VALUES ('DEVICE_UNIQUE_INDEX_DEFERRED', 'devices', ?)
    `, [JSON.stringify({ conflict_groups: remainingConflicts })]);
  }

  // 5. Baja del índice viejo POR NOMBRE (se creó sobre la columna `serial`,
  //    que `20260512140524` renombró a `serial_number` — el nombre no
  //    acompañó al rename). `registerDevices` ya no depende de él (Fase 2).
  await knex.raw(`DROP INDEX IF EXISTS devices_agent_serial_unique`);
}

export async function down(knex: Knex): Promise<void> {
  // El dedupe NO es reversible (mismo criterio que 20260511000008): las filas
  // fusionadas no se separan. `down()` sólo revierte los índices.
  await knex.raw(`DROP INDEX IF EXISTS devices_client_serial_uniq`);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS devices_client_serial_idx
      ON devices (client_id, serial_number) WHERE serial_number IS NOT NULL
  `);
}
