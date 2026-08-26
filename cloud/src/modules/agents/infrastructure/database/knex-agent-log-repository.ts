import type { Knex } from "knex";
import type { AgentLogRepository } from "../../domain/repositories/agent-log-repository";
import type { AgentLogRow } from "../../domain/services/agent-logs";

export class KnexAgentLogRepository implements AgentLogRepository {
  constructor(private readonly db: Knex) {}

  async insertMany(rows: AgentLogRow[]): Promise<void> {
    await this.db("agent_logs").insert(rows);
  }

  listRecent(agentId: string, limit: number) {
    return this.db("agent_logs").where({ agent_id: agentId }).orderBy("timestamp", "desc").limit(limit);
  }

  async findTimezone(agentId: string): Promise<string | null> {
    const row = await this.db("agents").where({ id: agentId }).select(this.db.raw("business_hours->>'timezone' as tz")).first();
    return row?.tz ?? null;
  }
}
