import { Knex } from "knex";

// ─── Reglas de auto-creación ────────────────────────────────────────────────

export async function listIncidentRules(db: Knex, clientId: string): Promise<any[]> {
  return db("incident_rules")
    .where((b) => b.whereNull("client_id").orWhere("client_id", clientId))
    .orderBy("class");
}

/**
 * Upsert por clase — sólo permite escribir filas del CLIENTE (nunca las
 * globales `client_id=NULL`). SELECT-then-INSERT/UPDATE explícito en vez de
 * `.onConflict()`: el índice único es sobre una expresión
 * (`COALESCE(client_id, nil-uuid), class`), no sobre columnas planas, y ya
 * hace falta leer `existing` para calcular los defaults — un segundo camino
 * por Knex `.onConflict(db.raw(...))` no aportaría nada que este branch
 * explícito no tenga ya, con menos certeza sobre el SQL generado.
 */
export async function upsertIncidentRule(
  db: Knex,
  clientId: string,
  klass: string,
  patch: { enabled?: boolean; min_severity?: string; delay_minutes?: number; sla_hours?: number | null; auto_close_on_alerts_resolved?: boolean }
): Promise<any> {
  const existing = await db("incident_rules").where({ client_id: clientId, class: klass }).first();
  const values = {
    client_id: clientId, class: klass,
    enabled: patch.enabled ?? existing?.enabled ?? false,
    min_severity: patch.min_severity ?? existing?.min_severity ?? "critical",
    delay_minutes: patch.delay_minutes ?? existing?.delay_minutes ?? 0,
    sla_hours: patch.sla_hours !== undefined ? patch.sla_hours : (existing?.sla_hours ?? null),
    auto_close_on_alerts_resolved: patch.auto_close_on_alerts_resolved ?? existing?.auto_close_on_alerts_resolved ?? false,
    updated_at: new Date(),
  };
  if (existing) {
    const [row] = await db("incident_rules").where({ id: existing.id }).update(values).returning("*");
    return row;
  }
  const [row] = await db("incident_rules").insert(values).returning("*");
  return row;
}
