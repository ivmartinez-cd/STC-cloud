import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AgentService } from "../../../services/agentService";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursConfig } from "../../../services/businessHours";
import { getScope } from "../../utils/scope";
import { onlyLiveDevices } from "../../utils/deviceFilters";
import { logger } from "../../../logger";
import { AGENT_SAFE_COLUMNS, type AgentIdParams } from "./shared";

async function listAgents(db: Knex, request: FastifyRequest) {
  const scope = getScope(request);
  return await db("agents")
    .join("clients", "agents.client_id", "clients.id")
    .modify((q) => {
      if (scope.kind === "client") q.where("agents.client_id", scope.id);
    })
    .select(
      "agents.id",
      "agents.name",
      "agents.hardware_id",
      "agents.version",
      "agents.host_name",
      "agents.host_os",
      "agents.host_ip",
      "agents.uptime",
      "agents.status",
      "agents.last_seen",
      "agents.client_id",
      "agents.created_at",
      "agents.remote_ews_enabled",
      "clients.name as client_name"
    )
    .orderBy("agents.created_at", "desc")
    // Antes sin límite — confirmado en vivo con 330 filas devueltas de
    // una (auditoría de capacidad, 200+ clientes). No es paginación real
    // todavía (misma forma de respuesta, sin offset) — sólo un techo de
    // seguridad; 2000 cubre con margen la escala objetivo (200 clientes
    // × algunos agentes cada uno).
    .limit(2000);
}

function parseAgentIpRanges(agent: Record<string, unknown>): unknown[] {
  if (!agent.ip_ranges) return [];
  try {
    return typeof agent.ip_ranges === "string" ? JSON.parse(agent.ip_ranges) : (agent.ip_ranges as unknown[]);
  } catch (e) {
    logger.error({ err: e }, "Error parsing ip_ranges in getAgent");
    return [];
  }
}

function parseAgentBusinessHours(agent: Record<string, unknown>): BusinessHoursConfig {
  // Igual que en agentService.getConfig(): se resuelve al default acá
  // para que el portal siempre muestre un valor concreto, nunca `null`.
  if (!agent.business_hours) return DEFAULT_BUSINESS_HOURS;
  try {
    return typeof agent.business_hours === "string" ? JSON.parse(agent.business_hours) : (agent.business_hours as BusinessHoursConfig);
  } catch (e) {
    logger.error({ err: e }, "Error parsing business_hours in getAgent");
    return DEFAULT_BUSINESS_HOURS;
  }
}

async function getAgent(db: Knex, agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const scope = getScope(request);
  // Para admin/operator se conserva `activation_key` (la muestra `LicenseCard.tsx`);
  // para client_viewer no se selecciona en absoluto, ni ella ni `snmp_community`/
  // `ip_ranges` del bloque `config` más abajo — no depende de armar el objeto y
  // borrar campos después, sino de no pedirlos a la base para ese rol.
  const columns =
    scope.kind === "all" ? [...AGENT_SAFE_COLUMNS, "agents.activation_key"] : AGENT_SAFE_COLUMNS;
  const agent = await db("agents")
    .where("agents.id", id)
    .select(
      ...columns,
      "clients.name as client_name",
      db.raw(
        "COUNT(DISTINCT CASE WHEN d.active = true AND d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS active_device_count"
      ),
      db.raw(
        "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NULL AND d.merged_into IS NULL THEN d.id END)::int AS total_device_count"
      ),
      db.raw(
        "COUNT(DISTINCT CASE WHEN d.decommissioned_at IS NOT NULL AND d.merged_into IS NULL THEN d.id END)::int AS decommissioned_device_count"
      ),
      ...(scope.kind === "all"
        ? ["agents.ip_ranges", "agents.snmp_community",
           "agents.toner_warning_threshold", "agents.toner_critical_threshold",
           "agents.business_hours"]
        : [])
    )
    .leftJoin("clients", "clients.id", "agents.client_id")
    .leftJoin("devices as d", "d.agent_id", "agents.id")
    .groupBy("agents.id", "clients.name")
    .first();
  // Antes devolvía `{error:"Monitor no encontrado"}` con HTTP 200 — el portal (y
  // cualquier consumidor de la API) no tenía forma de distinguir eso de un 200 real.
  if (!agent) return reply.status(404).send({ error: "Monitor no encontrado" });

  if (scope.kind !== "all") {
    return agent;
  }

  // Vista ENMASCARADA únicamente (nunca los secretos ya guardados) — evita
  // que `MonitorDetail` tenga que hacer un round-trip aparte a
  // /snmp-credentials sólo para mostrar cuántas hay configuradas.
  const maskedCreds = await agentService.getSnmpCredentialsMasked(id);

  return {
    ...agent,
    config: {
      ip_ranges: parseAgentIpRanges(agent),
      snmp_community: agent.snmp_community,
      scan_interval_minutes: agent.scan_interval_minutes,
      toner_warning_threshold: agent.toner_warning_threshold,
      toner_critical_threshold: agent.toner_critical_threshold,
      snmp_credentials: maskedCreds?.credentials ?? [],
      snmp_credentials_rev: maskedCreds?.rev ?? 0,
      business_hours: parseAgentBusinessHours(agent),
    },
  };
}

async function getAgentDevices(db: Knex, request: FastifyRequest) {
  const { id } = request.params as AgentIdParams;
  // Suma de deltas positivos entre lecturas consecutivas (no MAX-MIN del mes): un
  // reset/decremento de contador no debe inflar el volumen mensual mostrado en el
  // reporte del monitor. La subconsulta interna se extiende 40 días atrás para que
  // la primera lectura del mes tenga como base la última lectura del mes anterior.
  // Filtra por los dispositivos de ESTE agente ya dentro de la subconsulta (antes
  // escaneaba las lecturas de TODOS los dispositivos de TODOS los agentes antes de
  // joinear por `devices.agent_id`) — la consulta más cara que podía disparar
  // cualquier usuario del portal, viewer o no.
  const monthlySubquery = db.raw(
    `
    (
      SELECT
        device_id,
        SUM(GREATEST(total_pages_delta, 0))::int AS monthly_pages,
        SUM(GREATEST(mono_pages_delta,  0))::int AS monthly_mono,
        SUM(GREATEST(color_pages_delta, 0))::int AS monthly_color
      FROM (
        SELECT
          device_id,
          time,
          total_pages - LAG(total_pages) OVER (PARTITION BY device_id ORDER BY time) AS total_pages_delta,
          mono_pages  - LAG(mono_pages)  OVER (PARTITION BY device_id ORDER BY time) AS mono_pages_delta,
          color_pages - LAG(color_pages) OVER (PARTITION BY device_id ORDER BY time) AS color_pages_delta
        FROM readings
        WHERE time >= date_trunc('month', now()) - INTERVAL '40 days'
          AND device_id IN (SELECT id FROM devices WHERE agent_id = ? AND merged_into IS NULL)
      ) deltas
      WHERE time >= date_trunc('month', now())
      GROUP BY device_id
    ) as m
  `,
    [id]
  );

  const { include } = request.query as { include?: string };
  const includeDecommissioned = include === "decommissioned" || include === "all";

  return await db("devices")
    .where("devices.agent_id", id)
    .modify((q) => {
      if (!includeDecommissioned) onlyLiveDevices(q, "devices");
      else q.whereNull("devices.merged_into");
    })
    .leftJoin(monthlySubquery, "m.device_id", "devices.id")
    .leftJoin("device_usage_30d as u30", "u30.device_id", "devices.id")
    .leftJoin("device_models as dm", function () {
      this.on(db.raw("lower(dm.brand) = lower(devices.brand)"))
        .andOn(db.raw("dm.model_key = lower(btrim(devices.model))"));
    })
    .select(
      "devices.*",
      db.raw("COALESCE(m.monthly_pages, 0) AS monthly_pages"),
      db.raw("COALESCE(m.monthly_mono,  0) AS monthly_mono"),
      db.raw("COALESCE(m.monthly_color, 0) AS monthly_color"),
      db.raw("COALESCE(u30.pages_30d, 0) AS pages_30d"),
      db.raw("COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) as duty_cycle_effective"),
      db.raw(`
        CASE WHEN COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly) > 0
             THEN round(100.0 * COALESCE(u30.pages_30d, 0) / COALESCE(devices.duty_cycle_monthly_override, dm.duty_cycle_monthly))
        END as utilization_pct
      `)
    )
    .orderBy("devices.brand");
}

export function createPortalAgentReadHandlers(db: Knex, agentService: AgentService) {
  return {
    listAgents: (request: FastifyRequest) => listAgents(db, request),
    getAgent: (request: FastifyRequest, reply: FastifyReply) => getAgent(db, agentService, request, reply),
    getAgentDevices: (request: FastifyRequest) => getAgentDevices(db, request),
  };
}
