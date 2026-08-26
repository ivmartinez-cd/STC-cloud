import type { Knex } from "knex";
import { auditActionMeta } from "../../../../../shared/domain/audit-action-catalog";
import type { AgentActivityEvent } from "../../../domain/entities/monitor-detail";

/** "Actividad reciente" — compone 3 fuentes reales (nada inventado): alertas
 * abiertas/resueltas de este agente y sus equipos, acciones administrativas
 * auditadas sobre este agente (`audit_logs.target_id`), y comandos remotos
 * completados (`agent_commands`). Ordenado por fecha desc, recortado a `limit`. */
export async function getAgentRecentActivity(db: Knex | Knex.Transaction, agentId: string, limit: number): Promise<AgentActivityEvent[]> {
  const fetchLimit = Math.max(limit, 10);
  const [alertRows, auditRows, commandRows] = await Promise.all([
    db("alerts")
      .leftJoin("devices", "alerts.device_id", "devices.id")
      .where((b) => b.where("devices.agent_id", agentId).orWhere("alerts.agent_id", agentId))
      .orderBy("alerts.created_at", "desc")
      .limit(fetchLimit)
      .select(
        "alerts.id as id", "alerts.type as type", "alerts.message as message", "alerts.created_at as created_at",
        "alerts.resolved as resolved", "alerts.resolved_at as resolved_at", "devices.model as device_model"
      ),
    db("audit_logs")
      .where("target_id", agentId)
      .orderBy("created_at", "desc")
      .limit(fetchLimit)
      .leftJoin("users", "users.id", "audit_logs.user_id")
      .select("audit_logs.id as id", "audit_logs.action as action", "audit_logs.created_at as created_at", "users.username as user_username"),
    db("agent_commands")
      .where("agent_id", agentId)
      .whereIn("status", ["success", "error"])
      .whereNotNull("executed_at")
      .orderBy("executed_at", "desc")
      .limit(fetchLimit)
      .select("id", "type", "status", "executed_at"),
  ]);

  const events: AgentActivityEvent[] = [];

  for (const a of alertRows as Array<{ id: number; type: string; message: string | null; created_at: Date; resolved: boolean; resolved_at: Date | null; device_model: string | null }>) {
    const subject = a.device_model ?? "El monitor";
    const isAgentOffline = a.type === "agent_offline";
    events.push({
      id: `alert-open-${a.id}`,
      kind: isAgentOffline ? "incidencia" : "incidencia",
      text: isAgentOffline ? "Monitor sin señal" : `${subject}: ${a.message ?? "alerta abierta"}`,
      at: a.created_at,
    });
    if (a.resolved && a.resolved_at) {
      events.push({
        id: `alert-resolve-${a.id}`,
        kind: isAgentOffline ? "barrido" : "administrativo",
        text: isAgentOffline ? "Monitor reconectado" : `${subject}: alerta resuelta`,
        at: a.resolved_at,
      });
    }
  }
  for (const r of auditRows as Array<{ id: string; action: string; created_at: Date; user_username: string | null }>) {
    const label = auditActionMeta(r.action).label;
    events.push({
      id: `audit-${r.id}`, kind: "administrativo",
      text: r.user_username ? `${label} · ${r.user_username}` : label,
      at: r.created_at,
    });
  }
  const COMMAND_LABELS: Record<string, string> = {
    RESCAN: "Barrido de red completado", FORCE_SCAN: "Barrido de red completado",
    RESTART: "Agente reiniciado", FORCE_UPDATE: "Agente actualizado", UPDATE_CONFIG: "Configuración aplicada", STC_CONSOLE: "Comando de consola ejecutado",
  };
  for (const c of commandRows as Array<{ id: string; type: string; status: string; executed_at: Date }>) {
    events.push({
      id: `cmd-${c.id}`,
      kind: c.status === "success" ? "barrido" : "incidencia",
      text: `${COMMAND_LABELS[c.type] ?? c.type}${c.status === "error" ? " (con errores)" : ""}`,
      at: c.executed_at,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}
