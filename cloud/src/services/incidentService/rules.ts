import { Knex } from "knex";

// ─── Reglas de auto-creación ────────────────────────────────────────────────

export async function listIncidentRules(db: Knex, clientId: string): Promise<any[]> {
  return db("incident_rules")
    .where((b) => b.whereNull("client_id").orWhere("client_id", clientId))
    .orderBy("class");
}

type RulePatch = { enabled?: boolean; min_severity?: string; delay_minutes?: number; sla_hours?: number | null; auto_close_on_alerts_resolved?: boolean };

function ruleValues(clientId: string | null, klass: string, patch: RulePatch, existing: any) {
  return {
    client_id: clientId, class: klass,
    enabled: patch.enabled ?? existing?.enabled ?? false,
    min_severity: patch.min_severity ?? existing?.min_severity ?? "critical",
    delay_minutes: patch.delay_minutes ?? existing?.delay_minutes ?? 0,
    sla_hours: patch.sla_hours !== undefined ? patch.sla_hours : (existing?.sla_hours ?? null),
    auto_close_on_alerts_resolved: patch.auto_close_on_alerts_resolved ?? existing?.auto_close_on_alerts_resolved ?? false,
    updated_at: new Date(),
  };
}

/** SELECT-then-INSERT/UPDATE explícito en vez de `.onConflict()`: el índice
 * único es sobre una expresión (`COALESCE(client_id, nil-uuid), class`), no
 * sobre columnas planas, y ya hace falta leer `existing` para calcular los
 * defaults — un segundo camino por Knex `.onConflict(db.raw(...))` no
 * aportaría nada que este branch explícito no tenga ya. Compartido entre el
 * upsert por cliente y el global — sólo cambia el `client_id` del WHERE/valores. */
async function upsertRuleRow(db: Knex, clientId: string | null, klass: string, patch: RulePatch): Promise<any> {
  const existing = await db("incident_rules").where({ client_id: clientId, class: klass }).first();
  const values = ruleValues(clientId, klass, patch, existing);
  if (existing) {
    const [row] = await db("incident_rules").where({ id: existing.id }).update(values).returning("*");
    return row;
  }
  const [row] = await db("incident_rules").insert(values).returning("*");
  return row;
}

/** Sólo permite escribir filas del CLIENTE — nunca las globales (`client_id=NULL`). */
export function upsertIncidentRule(db: Knex, clientId: string, klass: string, patch: RulePatch): Promise<any> {
  return upsertRuleRow(db, clientId, klass, patch);
}

// ─── Reglas GLOBALES (client_id IS NULL) ───────────────────────────────────
// Gap real cerrado post-verificación del handoff hifi #3 (26/08/2026): antes
// sólo existía edición POR CLIENTE (`upsertIncidentRule` de arriba, que a
// propósito nunca toca las filas globales) — no había forma de editar la
// regla que de verdad aplica a un cliente SIN override propio. El botón "VER
// REGLA" del banner de Incidentes navegaba a un cliente puntual como
// aproximación honesta a falta de esto; ahora tiene un destino real.

export async function listGlobalIncidentRules(db: Knex): Promise<any[]> {
  return db("incident_rules").whereNull("client_id").orderBy("class");
}

export function upsertGlobalIncidentRule(db: Knex, klass: string, patch: RulePatch): Promise<any> {
  return upsertRuleRow(db, null, klass, patch);
}
