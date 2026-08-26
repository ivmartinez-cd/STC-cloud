import type { Knex } from "knex";

export async function findAgentForEws(db: Knex | Knex.Transaction, id: string) {
  return (await db("agents").where({ id }).select("remote_ews_enabled", "scan_interval_minutes").first()) ?? null;
}

export async function findDeviceForEws(db: Knex | Knex.Transaction, agentId: string, deviceId: string) {
  return (await db("devices").where({ id: deviceId, agent_id: agentId }).whereNull("decommissioned_at").whereNull("merged_into")
    .select("id", "ip_address", "last_seen").first()) ?? null;
}

export function updateRemoteEwsEnabled(db: Knex | Knex.Transaction, id: string, enabled: boolean): Promise<number> {
  return db("agents").where({ id }).update({ remote_ews_enabled: enabled });
}
