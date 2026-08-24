import type { Knex } from "knex";
import { parseNaiveLocalTimestamp } from "../businessHours";
import type { IncomingLogEntry } from "./types";

export function buildAgentLogRows(agentId: string, logs: IncomingLogEntry[], timezone: string) {
  return logs.map(l => {
    let ts: Date | null = null;
    const raw = l.timestamp || l.time; // Soportar ambos nombres de campo

    if (raw) {
      ts = parseNaiveLocalTimestamp(String(raw), timezone) ?? new Date(raw);
    } else {
      ts = new Date();
    }

    return {
      agent_id: agentId,
      level: l.level || 'INFO',
      message: l.message,
      timestamp: (!ts || isNaN(ts.getTime())) ? new Date() : ts
    };
  });
}

export async function recordSyncFailureLog(db: Knex, agentId: string, message: string, timezone: string): Promise<void> {
  const rows = buildAgentLogRows(agentId, [{ time: new Date().toISOString(), level: 'ERROR', message }], timezone);
  await db("agent_logs").insert(rows);
}
