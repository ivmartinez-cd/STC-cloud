import { DEFAULT_BUSINESS_HOURS } from "../../../../shared/domain/business-hours";
import type { IncomingLogEntry } from "../../domain/entities/agent";
import type { AgentLogRepository } from "../../domain/repositories/agent-log-repository";
import { buildAgentLogRows, buildLogsReport } from "../../domain/services/agent-logs";

/** Logs remotos del agente: ingesta (heartbeat) y lectura/exportación (portal). */
export class AgentLogsUseCase {
  constructor(private readonly logs: AgentLogRepository) {}

  /** `timezone` sólo interpreta timestamps naive DD/MM/YYYY de binarios viejos. */
  async ingest(agentId: string, logs: IncomingLogEntry[], timezone: string = DEFAULT_BUSINESS_HOURS.timezone): Promise<void> {
    if (!logs || logs.length === 0) return;
    await this.logs.insertMany(buildAgentLogRows(agentId, logs, timezone));
  }

  /** Registro de una falla de sync como log ERROR del agente (no tumba el lote). */
  recordSyncFailure(agentId: string, message: string, timezone: string): Promise<void> {
    return this.logs.insertMany(buildAgentLogRows(agentId, [{ time: new Date().toISOString(), level: "ERROR", message }], timezone));
  }

  list(agentId: string, limit = 50) {
    return this.logs.listRecent(agentId, limit);
  }

  /** Últimos 1000 en orden cronológico, como reporte de texto plano — en la TZ real del agente, no una fija. */
  async exportReport(agentId: string): Promise<string> {
    const [logs, timezone] = await Promise.all([
      this.logs.listRecent(agentId, 1000),
      this.logs.findTimezone(agentId),
    ]);
    logs.reverse();
    return buildLogsReport(agentId, logs, timezone ?? DEFAULT_BUSINESS_HOURS.timezone);
  }
}
