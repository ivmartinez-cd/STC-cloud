import { Knex } from "knex";

/**
 * `incident_events` es el audit trail PROPIO del incidente (kind/body/metadata/
 * user/fecha) — no se duplica en `audit_logs` genérico, que ya tiene su propio
 * feed de "Movimientos y cambios" para acciones de dispositivos/clientes/usuarios.
 */
export async function writeEvent(
  db: Knex | Knex.Transaction,
  params: { incidentId: string; kind: string; body?: string | null; metadata?: unknown; userId?: string | null }
): Promise<void> {
  await db("incident_events").insert({
    incident_id: params.incidentId,
    kind: params.kind,
    body: params.body ?? null,
    metadata: params.metadata !== undefined ? JSON.stringify(params.metadata) : null,
    user_id: params.userId ?? null,
  });
}
