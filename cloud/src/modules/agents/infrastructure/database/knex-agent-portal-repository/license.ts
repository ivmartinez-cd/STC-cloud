import type { Knex } from "knex";
import type { AgentLicense } from "../../../domain/entities/monitor-detail";

export async function getAgentLicense(db: Knex | Knex.Transaction, agentId: string): Promise<AgentLicense | null> {
  const agent = await db("agents").where("id", agentId).select("status", "hardware_id", "created_at", "client_id").first();
  if (!agent) return null;

  const [client, orgCounts] = await Promise.all([
    db("clients").where("id", agent.client_id).select("id", "name").first(),
    db("agents")
      .where("client_id", agent.client_id)
      .select(
        db.raw(
          "(SELECT COUNT(*) FROM devices WHERE devices.client_id = ? AND devices.decommissioned_at IS NULL AND devices.merged_into IS NULL)::int as device_count",
          [agent.client_id]
        ),
        db.raw("COUNT(*) FILTER (WHERE agents.status != 'revoked')::int as monitor_count")
      )
      .first(),
  ]);

  const ROTATION_DAYS = 90;
  const msPerDay = 24 * 60 * 60 * 1000;
  const emitidaAt: Date = agent.created_at;
  let nextRotationMs = emitidaAt.getTime() + ROTATION_DAYS * msPerDay;
  const now = Date.now();
  while (nextRotationMs <= now) nextRotationMs += ROTATION_DAYS * msPerDay;

  return {
    estado: agent.status === "revoked" ? "revocada" : "vigente",
    hardware_id: agent.hardware_id,
    emitida_at: emitidaAt,
    proxima_rotacion_at: new Date(nextRotationMs),
    rotacion_dias: ROTATION_DAYS,
    organizacion: {
      id: client?.id ?? agent.client_id,
      nombre: client?.name ?? "—",
      device_count: Number(orgCounts?.device_count ?? 0),
      monitor_count: Number(orgCounts?.monitor_count ?? 0),
    },
  };
}
