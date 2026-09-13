import type { Knex } from "knex";
import type { AgentScope } from "../../../domain/entities/agent";

/**
 * Columnas seguras de `agents` para el portal. Reemplaza el `agents.*` que
 * devolvía `jwt_secret`, `refresh_token_hash` y una `activation_key` VIVA a
 * cualquier rol. `activation_key` sólo para admin/operator; `jwt_secret` y
 * `refresh_token_hash` no se exponen NUNCA.
 */
export const AGENT_SAFE_COLUMNS = [
  "agents.id", "agents.client_id", "agents.name", "agents.status", "agents.last_seen", "agents.created_at",
  "agents.hardware_id", "agents.version", "agents.host_name", "agents.host_os", "agents.host_ip", "agents.uptime",
  "agents.scan_interval_minutes", "agents.remote_ews_enabled",
  // Canal de update + runtime del proceso: van juntos porque sólo sirven
  // comparados. El canal se hornea en build time y el runtime lo reporta el
  // proceso vivo; si no se corresponden, el próximo update instala un bundle
  // que ese runtime no puede ejecutar y el agente no vuelve a levantar.
  "agents.channel", "agents.runtime",
];

const LIST_COLUMNS = [
  "agents.id", "agents.name", "agents.hardware_id", "agents.version", "agents.host_name", "agents.host_os", "agents.host_ip",
  "agents.uptime", "agents.status", "agents.last_seen", "agents.client_id", "agents.created_at", "agents.remote_ews_enabled",
];

const CONFIG_COLUMNS = ["agents.ip_ranges", "agents.snmp_community", "agents.toner_warning_threshold", "agents.toner_critical_threshold", "agents.business_hours", "agents.monitor_intervals"];

// Conteos de dispositivos del agente por estado, como SQL literal (sin
// interpolación: ni las condiciones ni los alias son variables).
const DEVICE_COUNT_EXPRESSIONS = [
  "COUNT(DISTINCT CASE WHEN d.active = true AND d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS active_device_count",
  "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS total_device_count",
  "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count",
] as const;

export function listAgents(db: Knex | Knex.Transaction, scope: AgentScope): Promise<unknown[]> {
  return db("agents").join("clients", "agents.client_id", "clients.id")
    .modify((q) => { if (scope.kind === "client") q.where("agents.client_id", scope.id); })
    .select(...LIST_COLUMNS, "clients.name as client_name")
    .orderBy("agents.created_at", "desc")
    // Techo de seguridad (auditoría de capacidad), no paginación real todavía.
    .limit(2000);
}

export async function getAgentDetail(db: Knex | Knex.Transaction, id: string, full: boolean): Promise<Record<string, any> | null> {
  const columns = full ? [...AGENT_SAFE_COLUMNS, "agents.activation_key"] : AGENT_SAFE_COLUMNS;
  const row = await db("agents").where("agents.id", id)
    .select(
      ...columns, "clients.name as client_name",
      ...DEVICE_COUNT_EXPRESSIONS.map((sql) => db.raw(sql)),
      ...(full ? CONFIG_COLUMNS : [])
    )
    .leftJoin("clients", "clients.id", "agents.client_id")
    .leftJoin("devices as d", "d.agent_id", "agents.id")
    .groupBy("agents.id", "clients.name").first();
  return row ?? null;
}
