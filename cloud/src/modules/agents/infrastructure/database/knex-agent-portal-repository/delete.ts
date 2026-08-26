import type { Knex } from "knex";
import type { AgentDeleteSnapshot } from "../../../domain/repositories/agent-portal-repository";

export async function agentSnapshotForDelete(db: Knex | Knex.Transaction, id: string): Promise<AgentDeleteSnapshot | null> {
  return (await db("agents").where({ id }).select("name", "client_id").first()) ?? null;
}

export async function agentDeviceIdsOf(db: Knex | Knex.Transaction, agentId: string): Promise<string[]> {
  const rows = await db("devices").where("agent_id", agentId).select("id");
  return rows.map((d: { id: string }) => d.id);
}

export async function agentAnyClosureLines(db: Knex | Knex.Transaction, deviceIds: string[]): Promise<boolean> {
  return !!(await db("report_closure_lines").whereIn("device_id", deviceIds).first());
}

export async function agentDeleteCascade(db: Knex | Knex.Transaction, agentId: string, deviceIds: string[]): Promise<void> {
  if (deviceIds.length > 0) {
    await db("readings").whereIn("device_id", deviceIds).delete();
    await db("devices").where("agent_id", agentId).delete();
  }
  await db("agents").where("id", agentId).delete();
}
