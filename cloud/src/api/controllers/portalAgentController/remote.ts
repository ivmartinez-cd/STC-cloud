import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { AgentService } from "../../../services/agentService";
import { sendCommandToAgent } from "../../../ws/index";
import { waitForEwsProxyResult } from "../../../services/ewsProxyService";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";
import type { AgentIdParams } from "./shared";

async function sendCommand(fastify: FastifyInstance, db: Knex, agentService: AgentService, request: FastifyRequest) {
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
}

async function assertEwsEligibleDevice(db: Knex, id: string, deviceId: string, reply: FastifyReply) {
  const agent = await db("agents").where({ id }).select("remote_ews_enabled", "scan_interval_minutes").first();
  if (!agent) return { error: reply.status(404).send({ error: "Agente no encontrado" }) };
  if (!agent.remote_ews_enabled) {
    return { error: reply.status(403).send({ error: "Remote EWS no está habilitado para este agente" }) };
  }

  const device = await db("devices")
    .where({ id: deviceId, agent_id: id })
    .whereNull("decommissioned_at")
    .whereNull("merged_into")
    .select("id", "ip_address", "last_seen")
    .first();
  if (!device) return { error: reply.status(404).send({ error: "Dispositivo no encontrado para este agente" }) };
  if (!device.ip_address) return { error: reply.status(409).send({ error: "El dispositivo no tiene una IP registrada todavía" }) };

  // Ventana de staleness: una IP reasignada por DHCP entre el último scan
  // y este proxy podría apuntar a un equipo distinto del que el admin
  // cree que es — `deviceIdentity.ts` sólo corrige esto reactivamente en
  // el próximo scan, no hay verificación live. Umbral conservador: 2x el
  // intervalo de scan configurado (o 30 min si no hay uno seteado).
  const staleThresholdMs = 2 * (agent.scan_interval_minutes || 15) * 60 * 1000;
  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
  if (Date.now() - lastSeenMs > staleThresholdMs) {
    return {
      error: reply.status(409).send({
        error: "El dispositivo no reportó recientemente — la IP podría haber sido reasignada. Esperá al próximo scan.",
      }),
    };
  }

  return { device };
}

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
async function ewsProxy(db: Knex, agentService: AgentService, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as AgentIdParams;
  const { device_id, path } = request.body as { device_id: string; path: string };
  const user = (request as FastifyRequest & { user: PortalUser }).user;

  const checked = await assertEwsEligibleDevice(db, id, device_id, reply);
  if (checked.error) return checked.error;
  const device = checked.device!;

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
}

/** Toggle auditado por separado del uso (`REMOTE_EWS_TOGGLE` vs `REMOTE_EWS_ACCESS`) — activar el acceso es una decisión distinta de cada uso puntual. */
async function setRemoteEwsEnabled(db: Knex, request: FastifyRequest, reply: FastifyReply) {
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
}

async function triggerScan(agentService: AgentService, request: FastifyRequest) {
  const { id } = request.params as AgentIdParams;
  const sentInstant = sendCommandToAgent(id, "RESCAN");
  await agentService.addCommand(id, "RESCAN");
  return {
    status: "success",
    message: sentInstant
      ? "Comando enviado instantáneamente vía WSS"
      : "Agente offline. Comando encolado para próximo latido.",
  };
}

export function createPortalAgentRemoteHandlers(fastify: FastifyInstance, db: Knex, agentService: AgentService) {
  return {
    sendCommand: (request: FastifyRequest) => sendCommand(fastify, db, agentService, request),
    ewsProxy: (request: FastifyRequest, reply: FastifyReply) => ewsProxy(db, agentService, request, reply),
    setRemoteEwsEnabled: (request: FastifyRequest, reply: FastifyReply) => setRemoteEwsEnabled(db, request, reply),
    triggerScan: (request: FastifyRequest) => triggerScan(agentService, request),
  };
}
