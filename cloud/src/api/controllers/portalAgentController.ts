import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService, AgentConfigUpdate } from "../../services/agentService";
import { MissingEncryptionKeyError } from "../../services/cryptoService";
import { SnmpCredentialValidationError } from "../../services/snmpCredentials";
import { IpRangeValidationError } from "../../services/ipRangeSpec";
import { BusinessHoursValidationError, DEFAULT_BUSINESS_HOURS, type BusinessHoursConfig } from "../../services/businessHours";
import { sendCommandToAgent } from "../../ws/index";
import { waitForEwsProxyResult } from "../../services/ewsProxyService";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import { getScope } from "../utils/scope";
import { onlyLiveDevices } from "../utils/deviceFilters";
import { logger } from "../../logger";

/**
 * Columnas seguras de `agents` para exponer por el portal. Reemplaza el `agents.*`
 * anterior, que devolvía `jwt_secret`, `refresh_token_hash` y una `activation_key`
 * VIVA (se reemite en `regenerateActivationKey` — no es sólo una clave ya usada) a
 * cualquier rol, incluido `client_viewer`. `activation_key` se agrega de vuelta sólo
 * para admin/operator (la usa `LicenseCard.tsx` en el portal); `jwt_secret` y
 * `refresh_token_hash` no se exponen NUNCA, ningún consumidor del portal los usa.
 */
const AGENT_SAFE_COLUMNS = [
  "agents.id",
  "agents.client_id",
  "agents.name",
  "agents.status",
  "agents.last_seen",
  "agents.created_at",
  "agents.hardware_id",
  "agents.version",
  "agents.host_name",
  "agents.host_os",
  "agents.host_ip",
  "agents.uptime",
  "agents.scan_interval_minutes",
  "agents.remote_ews_enabled",
];

/** Parámetros de ruta con ID de agente. */
interface AgentIdParams { id: string; }

/** Query string con límite opcional. */
interface LimitQuery { limit?: string; }

function formatDateAR(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return date.toISOString();
  }
}

export function createPortalAgentController(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  return {
    listAgents: async (request: FastifyRequest) => {
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
    },

    getAgent: async (request: FastifyRequest, reply: FastifyReply) => {
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

      let parsedIpRanges = [];
      if (agent.ip_ranges) {
        try {
          parsedIpRanges = typeof agent.ip_ranges === "string" ? JSON.parse(agent.ip_ranges) : agent.ip_ranges;
        } catch (e) {
          logger.error({ err: e }, "Error parsing ip_ranges in getAgent");
        }
      }

      // Igual que en agentService.getConfig(): se resuelve al default acá
      // para que el portal siempre muestre un valor concreto, nunca `null`.
      let businessHours: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS;
      if (agent.business_hours) {
        try {
          businessHours = typeof agent.business_hours === "string" ? JSON.parse(agent.business_hours) : agent.business_hours;
        } catch (e) {
          logger.error({ err: e }, "Error parsing business_hours in getAgent");
        }
      }

      // Vista ENMASCARADA únicamente (nunca los secretos ya guardados) — evita
      // que `MonitorDetail` tenga que hacer un round-trip aparte a
      // /snmp-credentials sólo para mostrar cuántas hay configuradas.
      const maskedCreds = await agentService.getSnmpCredentialsMasked(id);

      return {
        ...agent,
        config: {
          ip_ranges: parsedIpRanges,
          snmp_community: agent.snmp_community,
          scan_interval_minutes: agent.scan_interval_minutes,
          toner_warning_threshold: agent.toner_warning_threshold,
          toner_critical_threshold: agent.toner_critical_threshold,
          snmp_credentials: maskedCreds?.credentials ?? [],
          snmp_credentials_rev: maskedCreds?.rev ?? 0,
          business_hours: businessHours,
        },
      };
    },

    getAgentDevices: async (request: FastifyRequest) => {
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
        .select(
          "devices.*",
          db.raw("COALESCE(m.monthly_pages, 0) AS monthly_pages"),
          db.raw("COALESCE(m.monthly_mono,  0) AS monthly_mono"),
          db.raw("COALESCE(m.monthly_color, 0) AS monthly_color")
        )
        .orderBy("devices.brand");
    },

    createAgent: async (request: FastifyRequest, reply: FastifyReply) => {
      const { clientId, name, ip_ranges, snmp_community, scan_interval_minutes, business_hours } =
        request.body as { clientId: string; name: string; ip_ranges?: unknown; snmp_community?: string; scan_interval_minutes?: number; business_hours?: unknown };
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      try {
        return await agentService.createActivationKey(clientId, name, {
          ip_ranges: ip_ranges as AgentConfigUpdate["ip_ranges"],
          snmp_community,
          scan_interval_minutes,
          business_hours: business_hours as AgentConfigUpdate["business_hours"],
        }, {
          userId: user?.userId,
          ip: getClientIp(request),
        });
      } catch (e: unknown) {
        if (e instanceof IpRangeValidationError || e instanceof BusinessHoursValidationError) {
          return reply.status(400).send({ error: e.message, field: e.field });
        }
        throw e;
      }
    },

    deleteAgent: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({ error: "ID de agente inválido" });
      }
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      const requestIp = getClientIp(request);
      try {
        fastify.log.info({ agentId: id }, "Solicitud de eliminación de agente y cascada");

        await db.transaction(async (trx) => {
          const agent = await trx("agents").where({ id }).select("name", "client_id").first();
          const devices = await trx("devices").where("agent_id", id).select("id");
          const deviceIds = devices.map((d: { id: string }) => d.id);

          if (deviceIds.length > 0) {
            // Mientras `devices.agent_id` sea ON DELETE CASCADE, borrar un agente
            // es una puerta trasera del ciclo de vida — bloquear si algún equipo
            // tiene historial de facturación en vez de destruirlo en silencio.
            const hasClosureLines = await trx("report_closure_lines")
              .whereIn("device_id", deviceIds)
              .first();
            if (hasClosureLines) {
              throw Object.assign(
                new Error("Hay equipos con historial de facturación; movelos a otro monitor o dalos de baja antes de eliminar este agente"),
                { status: 409 }
              );
            }
            await trx("readings").whereIn("device_id", deviceIds).delete();
            await trx("devices").where("agent_id", id).delete();
          }

          await trx("agents").where("id", id).delete();

          await trx("audit_logs").insert({
            action: "AGENT_DELETED",
            target_id: id,
            user_id: user?.userId ?? null,
            ip_address: requestIp,
            metadata: JSON.stringify({
              name: agent?.name ?? null,
              client_id: agent?.client_id ?? null,
              devices_removed: deviceIds.length,
            }),
          });
        });

        return { status: "deleted" };
      } catch (err: any) {
        if (err?.status === 409) {
          return reply.status(409).send({ error: err.message });
        }
        fastify.log.error(err, "Error al eliminar agente");
        const errMsg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: "Internal Server Error", details: errMsg });
      }
    },

    revokeAgent: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const requestIp = getClientIp(request);
      await agentService.revokeToken(redis, id, 30 * 24 * 60 * 60, requestIp);
      return { status: "revoked" };
    },

    regenerateKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      try {
        return await agentService.regenerateActivationKey(id, {
          userId: user?.userId,
          ip: getClientIp(request),
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: errMsg });
      }
    },

    sendCommand: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { type, payload } = request.body as { type: string; payload?: Record<string, unknown> };
      const user = (request as FastifyRequest & { user: PortalUser }).user;

      const command = await agentService.addCommand(id, type, payload || {}, user?.userId);
      fastify.log.info(
        { agentId: id, type, commandId: command.id },
        "Comando remoto registrado y pendiente"
      );

      await db("audit_logs").insert({
        action: "AGENT_COMMAND",
        target_id: id,
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ type, payload: payload || {} }),
      });

      const sentViaWss = sendCommandToAgent(id, type, payload || {}, command.id);
      if (sentViaWss) {
        fastify.log.info({ agentId: id }, "Comando empujado instantáneamente vía WSS");
      }

      return { success: true, commandId: command.id, instant: sentViaWss };
    },

    /**
     * Remote EWS por túnel sobre el WSS existente (Fase 2 del gap analysis).
     * Proxy SÍNCRONO de un solo GET — no abre una sesión de túnel
     * persistente, cada llamada es un request/response independiente
     * resuelto vía `ewsProxyService.ts` (nunca por `broadcastToPortal`, que
     * mandaría el contenido de la EWS a cualquier admin/operator conectado
     * en simultáneo). Allowlist en dos capas: acá (cloud) sólo se acepta un
     * `device_id` real, no una IP tipeada a mano, y se resuelve la IP ACTUAL
     * desde `devices` (nunca la que mande el cliente); el agente valida de
     * nuevo contra su `known_devices` local antes de hacer el request real
     * (defensa en profundidad, ver `CommandHandler.ts` agente).
     */
    ewsProxy: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const { device_id, path } = request.body as { device_id: string; path: string };
      const user = (request as FastifyRequest & { user: PortalUser }).user;

      const agent = await db("agents").where({ id }).select("remote_ews_enabled", "scan_interval_minutes").first();
      if (!agent) return reply.status(404).send({ error: "Agente no encontrado" });
      if (!agent.remote_ews_enabled) {
        return reply.status(403).send({ error: "Remote EWS no está habilitado para este agente" });
      }

      const device = await db("devices")
        .where({ id: device_id, agent_id: id })
        .whereNull("decommissioned_at")
        .whereNull("merged_into")
        .select("id", "ip_address", "last_seen")
        .first();
      if (!device) return reply.status(404).send({ error: "Dispositivo no encontrado para este agente" });
      if (!device.ip_address) return reply.status(409).send({ error: "El dispositivo no tiene una IP registrada todavía" });

      // Ventana de staleness: una IP reasignada por DHCP entre el último scan
      // y este proxy podría apuntar a un equipo distinto del que el admin
      // cree que es — `deviceIdentity.ts` sólo corrige esto reactivamente en
      // el próximo scan, no hay verificación live. Umbral conservador: 2x el
      // intervalo de scan configurado (o 30 min si no hay uno seteado).
      const staleThresholdMs = 2 * (agent.scan_interval_minutes || 15) * 60 * 1000;
      const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
      if (Date.now() - lastSeenMs > staleThresholdMs) {
        return reply.status(409).send({
          error: "El dispositivo no reportó recientemente — la IP podría haber sido reasignada. Esperá al próximo scan.",
        });
      }

      if (typeof path !== "string" || !path.startsWith("/") || /[\r\n]/.test(path) || path.length > 500) {
        return reply.status(400).send({ error: "path inválido: debe empezar con '/', sin saltos de línea, máx 500 chars" });
      }

      const command = await agentService.addCommand(
        id, "EWS_PROXY", { ip: device.ip_address, path, method: "GET" }, user?.userId
      );

      const sentViaWss = sendCommandToAgent(id, "EWS_PROXY", { ip: device.ip_address, path, method: "GET" }, command.id);
      if (!sentViaWss) {
        await agentService.updateCommandResult(command.id, "error", { error: "Agente no conectado" });
        return reply.status(503).send({ error: "El agente no está conectado ahora mismo" });
      }

      try {
        const result = await waitForEwsProxyResult(command.id, id, 15_000);
        await db("audit_logs").insert({
          action: "REMOTE_EWS_ACCESS",
          target_id: id,
          user_id: user?.userId ?? null,
          ip_address: getClientIp(request),
          // Nunca el body completo acá (dato interno del cliente, retención
          // indefinida en audit_logs) — sólo metadata de la request.
          metadata: JSON.stringify({ device_id, path, method: "GET", status: result.status, truncated: result.truncated }),
        });
        return { status: result.status, headers: result.headers, body_base64: result.bodyBase64, truncated: result.truncated };
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await db("audit_logs").insert({
          action: "REMOTE_EWS_ACCESS",
          target_id: id,
          user_id: user?.userId ?? null,
          ip_address: getClientIp(request),
          metadata: JSON.stringify({ device_id, path, method: "GET", error: errMsg }),
        });
        return reply.status(502).send({ error: errMsg });
      }
    },

    /** Toggle auditado por separado del uso (`REMOTE_EWS_TOGGLE` vs `REMOTE_EWS_ACCESS`) — activar el acceso es una decisión distinta de cada uso puntual. */
    setRemoteEwsEnabled: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const { enabled } = request.body as { enabled: boolean };
      const user = (request as FastifyRequest & { user: PortalUser }).user;

      const updated = await db("agents").where({ id }).update({ remote_ews_enabled: enabled });
      if (updated === 0) return reply.status(404).send({ error: "Agente no encontrado" });

      await db("audit_logs").insert({
        action: "REMOTE_EWS_TOGGLE",
        target_id: id,
        user_id: user?.userId ?? null,
        ip_address: getClientIp(request),
        metadata: JSON.stringify({ enabled }),
      });

      return { ok: true, remote_ews_enabled: enabled };
    },

    triggerScan: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const sentInstant = sendCommandToAgent(id, "RESCAN");
      await agentService.addCommand(id, "RESCAN");
      return {
        status: "success",
        message: sentInstant
          ? "Comando enviado instantáneamente vía WSS"
          : "Agente offline. Comando encolado para próximo latido.",
      };
    },

    getLogs: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      const { limit } = request.query as LimitQuery;
      return await agentService.getLogs(id, limit ? parseInt(limit, 10) : 50);
    },

    exportLogs: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const logs = await agentService.getLogs(id, 1000);
      logs.reverse();

      let report = "================================================================================\n";
      report += "STC CLOUD - REPORTE DE AUDITORÍA DE AGENTE\n";
      report += "================================================================================\n";
      report += `Agente ID: ${id}\n`;
      report += `Generado:  ${formatDateAR(new Date())}\n`;
      report += "--------------------------------------------------------------------------------\n\n";
      report += "[ FECHA Y HORA ]        [ NIVEL ]   [ MENSAJE ]\n";
      report += "--------------------------------------------------------------------------------\n";

      logs.forEach((l: { timestamp?: string; level?: string; message: string }) => {
        const dateObj = new Date(l.timestamp ?? 0);
        const time = isNaN(dateObj.getTime()) ? "---" : formatDateAR(dateObj);
        const level = (l.level || "INFO").padEnd(8);
        report += `${time.padEnd(23)} ${level} ${l.message}\n`;
      });

      report += "\n--------------------------------------------------------------------------------\n";
      report += "Fin del reporte - STC Cloud Monitor\n";

      reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Disposition", `attachment; filename=log_${id}.txt`)
        .send(report);
    },

    getConfig: async (request: FastifyRequest) => {
      const { id } = request.params as AgentIdParams;
      // `agentService.getConfig()` es el método que alimenta el HEARTBEAT del
      // agente y por eso descifra `snmp_credentials` a texto plano — NUNCA se
      // le puede devolver eso al portal, ni a admin/operator. Se pide la
      // config general y se pisa el campo con la vista enmascarada (o se lo
      // saca del todo si no hay ninguna credencial guardada).
      const config = await agentService.getConfig(id);
      if (config) {
        const masked = await agentService.getSnmpCredentialsMasked(id);
        if (masked && masked.credentials.length > 0) {
          config.snmp_credentials = masked.credentials;
        } else {
          delete config.snmp_credentials;
        }
        // Mismo criterio que arriba: `getConfig()` ya viene con `ip_ranges`
        // COMPILADO (CIDR/exclusiones expandidos a pares planos, lo que
        // necesita el heartbeat) — el portal necesita ver el spec crudo tal
        // cual el admin lo escribió, no una lista fragmentada de sub-rangos.
        config.ip_ranges = await agentService.getIpRangeSpecsRaw(id);
      }
      return config;
    },

    updateConfig: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      try {
        return await agentService.updateConfig(id, request.body as AgentConfigUpdate, {
          userId: user?.userId,
          ip: getClientIp(request),
        });
      } catch (e: unknown) {
        if (e instanceof IpRangeValidationError || e instanceof BusinessHoursValidationError) {
          return reply.status(400).send({ error: e.message, field: e.field });
        }
        throw e;
      }
    },

    getSnmpCredentials: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const result = await agentService.getSnmpCredentialsMasked(id);
      if (!result) return reply.status(404).send({ error: "Monitor no encontrado" });
      return result;
    },

    updateSnmpCredentials: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as AgentIdParams;
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      try {
        const result = await agentService.replaceSnmpCredentials(id, request.body, {
          userId: user?.userId,
          ip: getClientIp(request),
        });
        if (!result) return reply.status(404).send({ error: "Monitor no encontrado" });
        if (result.status === "conflict") {
          return reply.status(409).send({
            error: "La lista de credenciales cambió desde que la cargaste — recargá y volvé a intentar",
            rev: result.rev,
          });
        }
        return result;
      } catch (e: unknown) {
        if (e instanceof MissingEncryptionKeyError) {
          return reply.status(503).send({ error: e.message, code: e.code });
        }
        if (e instanceof SnmpCredentialValidationError) {
          return reply.status(400).send({ error: e.message, field: e.field });
        }
        throw e;
      }
    },
  };
}
