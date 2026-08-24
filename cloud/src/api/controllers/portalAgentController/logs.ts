import type { FastifyReply, FastifyRequest } from "fastify";
import type { AgentService } from "../../../services/agentService";
import { formatDateAR, type AgentIdParams, type LimitQuery } from "./shared";

async function getLogs(agentService: AgentService, request: FastifyRequest) {
  const { id } = request.params as AgentIdParams;
  const { limit } = request.query as LimitQuery;
  return await agentService.getLogs(id, limit ? parseInt(limit, 10) : 50);
}

function buildLogsReport(id: string, logs: Array<{ timestamp?: string; level?: string; message: string }>): string {
  let report = "================================================================================\n";
  report += "STC CLOUD - REPORTE DE AUDITORÍA DE AGENTE\n";
  report += "================================================================================\n";
  report += `Agente ID: ${id}\n`;
  report += `Generado:  ${formatDateAR(new Date())}\n`;
  report += "--------------------------------------------------------------------------------\n\n";
  report += "[ FECHA Y HORA ]        [ NIVEL ]   [ MENSAJE ]\n";
  report += "--------------------------------------------------------------------------------\n";

  logs.forEach((l) => {
    const dateObj = new Date(l.timestamp ?? 0);
    const time = isNaN(dateObj.getTime()) ? "---" : formatDateAR(dateObj);
    const level = (l.level || "INFO").padEnd(8);
    report += `${time.padEnd(23)} ${level} ${l.message}\n`;
  });

  report += "\n--------------------------------------------------------------------------------\n";
  report += "Fin del reporte - STC Cloud Monitor\n";
  return report;
}

async function exportLogs(agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const logs = await agentService.getLogs(id, 1000);
  logs.reverse();

  reply
    .header("Content-Type", "text/plain; charset=utf-8")
    .header("Content-Disposition", `attachment; filename=log_${id}.txt`)
    .send(buildLogsReport(id, logs));
}

export function createPortalAgentLogHandlers(agentService: AgentService) {
  return {
    getLogs: (request: FastifyRequest) => getLogs(agentService, request),
    exportLogs: (request: FastifyRequest, reply: FastifyReply) => exportLogs(agentService, request, reply),
  };
}
