import type { Knex } from "knex";
import type { AgentCommandRow } from "../../domain/entities/agent";
import type { AgentCommandRepository } from "../../domain/repositories/agent-command-repository";

export class KnexAgentCommandRepository implements AgentCommandRepository {
  constructor(private readonly db: Knex) {}

  async insertPending(agentId: string, type: string, payload: Record<string, unknown>, createdBy: string | null) {
    const [command] = await this.db("agent_commands").insert({
      agent_id: agentId, type, payload: JSON.stringify(payload), status: "pending", created_by: createdBy,
    }).returning("*");
    return command;
  }

  async takePending(agentId: string): Promise<AgentCommandRow[]> {
    const commands = await this.db("agent_commands").where({ agent_id: agentId, status: "pending" }).select("id", "type", "payload");
    if (commands.length > 0) {
      await this.db("agent_commands").whereIn("id", commands.map((c: { id: string }) => c.id)).update({ status: "sent", sent_at: new Date() });
    }
    return commands.map((c: { id: string; type: string; payload: unknown }) => ({
      id: c.id, type: c.type, payload: typeof c.payload === "string" ? JSON.parse(c.payload) : c.payload,
    }));
  }

  async setResult(commandId: string, agentId: string, status: string, result: Record<string, unknown> | null): Promise<void> {
    await this.db("agent_commands").where({ id: commandId, agent_id: agentId })
      .update({ status, result: result ? JSON.stringify(result) : null, executed_at: new Date() });
  }
}
