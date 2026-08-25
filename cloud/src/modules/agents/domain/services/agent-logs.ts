import { parseNaiveLocalTimestamp } from "../../../../shared/domain/business-hours";
import type { IncomingLogEntry } from "../entities/agent";

export interface AgentLogRow {
  agent_id: string;
  level: string;
  message: string;
  timestamp: Date;
}

/** Soporta `timestamp` y `time`; timestamps naive DD/MM/YYYY (agentes viejos) se interpretan en la TZ del agente. */
export function buildAgentLogRows(agentId: string, logs: IncomingLogEntry[], timezone: string): AgentLogRow[] {
  return logs.map((l) => {
    const raw = l.timestamp || l.time;
    const ts: Date | null = raw ? (parseNaiveLocalTimestamp(String(raw), timezone) ?? new Date(raw)) : new Date();
    return {
      agent_id: agentId,
      level: l.level || "INFO",
      message: l.message,
      timestamp: (!ts || isNaN(ts.getTime())) ? new Date() : ts,
    };
  });
}

export function formatDateAR(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZone: "America/Argentina/Buenos_Aires",
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return date.toISOString();
  }
}

/** Reporte de auditoría en texto plano para `GET /agents/:id/logs/export`. */
export function buildLogsReport(id: string, logs: Array<{ timestamp?: string; level?: string; message: string }>): string {
  const rule = "--------------------------------------------------------------------------------\n";
  const double = "================================================================================\n";
  let report = `${double}STC CLOUD - REPORTE DE AUDITORÍA DE AGENTE\n${double}`;
  report += `Agente ID: ${id}\nGenerado:  ${formatDateAR(new Date())}\n${rule}\n`;
  report += `[ FECHA Y HORA ]        [ NIVEL ]   [ MENSAJE ]\n${rule}`;
  logs.forEach((l) => {
    const dateObj = new Date(l.timestamp ?? 0);
    const time = isNaN(dateObj.getTime()) ? "---" : formatDateAR(dateObj);
    report += `${time.padEnd(23)} ${(l.level || "INFO").padEnd(8)} ${l.message}\n`;
  });
  return report + `\n${rule}Fin del reporte - STC Cloud Monitor\n`;
}
