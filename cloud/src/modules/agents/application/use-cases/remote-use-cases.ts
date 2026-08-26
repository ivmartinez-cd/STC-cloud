import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import type { AgentLink } from "../ports/agent-link";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { EwsProxyGateway } from "../ports/ews-proxy-gateway";
import type { Actor, EwsProxyInput, EwsProxyOutput, SendCommandInput } from "../dtos/agent-dtos";
import type { AgentCommandsUseCase } from "./command-use-cases";

export class RemoteActionError extends Error {
  constructor(message: string, public readonly statusCode: number) { super(message); }
}

/** Comando remoto genérico: persiste en `agent_commands`, audita y empuja por WSS si el agente está conectado. */
export class SendAgentCommandUseCase {
  constructor(private readonly commands: AgentCommandsUseCase, private readonly link: AgentLink, private readonly audit: AuditLogWriter) {}

  async execute(input: SendCommandInput): Promise<{ success: true; commandId: string; instant: boolean }> {
    const payload = input.payload || {};
    const command = await this.commands.add(input.agentId, input.type, payload, input.userId ?? undefined);
    await this.audit.write({ action: "AGENT_COMMAND", targetId: input.agentId, userId: input.userId, ipAddress: input.ipAddress, metadata: { type: input.type, payload } });
    const instant = this.link.pushCommand(input.agentId, input.type, payload, command.id);
    return { success: true, commandId: command.id, instant };
  }
}

/**
 * RESCAN: WSS al instante si está conectado; siempre queda encolado para el
 * próximo latido. Fase 6 (R5) señalaba esto como el único hallazgo menor sin
 * auditar de la pasada de seguridad — reusa la misma acción `AGENT_COMMAND`
 * que `SendAgentCommandUseCase` (mismo tipo de evento de negocio, sólo un
 * endpoint dedicado en vez de pasar por el genérico `/agents/:id/command`),
 * para que filtrar por acción encuentre ambos entry points sin distinción.
 */
export class TriggerScanUseCase {
  constructor(private readonly commands: AgentCommandsUseCase, private readonly link: AgentLink, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, actor: Actor): Promise<{ status: "success"; message: string }> {
    const sentInstant = this.link.pushCommand(agentId, "RESCAN");
    await this.commands.add(agentId, "RESCAN");
    await this.audit.write({ action: "AGENT_COMMAND", targetId: agentId, userId: actor.userId, ipAddress: actor.ipAddress, metadata: { type: "RESCAN", payload: {} } });
    return { status: "success", message: sentInstant ? "Comando enviado instantáneamente vía WSS" : "Agente offline. Comando encolado para próximo latido." };
  }
}

/** Toggle auditado por separado del uso (`REMOTE_EWS_TOGGLE` vs `REMOTE_EWS_ACCESS`). */
export class SetRemoteEwsEnabledUseCase {
  constructor(private readonly repo: AgentPortalRepository, private readonly audit: AuditLogWriter) {}

  async execute(agentId: string, enabled: boolean, actor: Actor): Promise<{ ok: true; remote_ews_enabled: boolean }> {
    if ((await this.repo.setRemoteEwsEnabled(agentId, enabled)) === 0) throw new RemoteActionError("Agente no encontrado", 404);
    await this.audit.write({ action: "REMOTE_EWS_TOGGLE", targetId: agentId, userId: actor.userId, ipAddress: actor.ipAddress, metadata: { enabled } });
    return { ok: true, remote_ews_enabled: enabled };
  }
}

/**
 * Remote EWS por túnel sobre el WSS: proxy SÍNCRONO de un solo GET. Allowlist
 * en dos capas: acá sólo se acepta un `device_id` real y se resuelve la IP
 * ACTUAL desde `devices` (nunca la que mande el cliente); el agente valida de
 * nuevo contra su `known_devices`. Ventana de staleness: 2× el intervalo de
 * scan (una IP reasignada por DHCP podría apuntar a otro equipo).
 */
export class EwsProxyUseCase {
  constructor(
    private readonly repo: AgentPortalRepository,
    private readonly commands: AgentCommandsUseCase,
    private readonly gateway: EwsProxyGateway,
    private readonly audit: AuditLogWriter
  ) {}

  async execute(input: EwsProxyInput): Promise<EwsProxyOutput> {
    const device = await this.assertEligibleDevice(input.agentId, input.deviceId);
    const path = input.path;
    if (typeof path !== "string" || !path.startsWith("/") || /[\r\n]/.test(path) || path.length > 500) {
      throw new RemoteActionError("path inválido: debe empezar con '/', sin saltos de línea, máx 500 chars", 400);
    }
    const payload = { ip: device.ip_address, path, method: "GET" };
    const command = await this.commands.add(input.agentId, "EWS_PROXY", payload, input.userId ?? undefined);
    // `pushCommand` intenta local y, si el agente está conectado a OTRA
    // réplica, hace relay por Redis (ver `ws/index.ts`) — sólo devuelve
    // `false` cuando no está conectado a NINGUNA réplica.
    if (!(await this.gateway.pushCommand(input.agentId, command.id, payload))) {
      await this.commands.updateResult(command.id, "error", { error: "Agente no conectado" });
      throw new RemoteActionError("El agente no está conectado ahora mismo", 503);
    }
    const base = { device_id: input.deviceId, path, method: "GET" };
    try {
      const result = await this.gateway.waitForResult(command.id, input.agentId, 15_000);
      // Nunca el body completo en audit_logs (dato interno del cliente) — sólo metadata de la request.
      await this.writeAccessAudit(input, { ...base, status: result.status, truncated: result.truncated });
      return { status: result.status, headers: result.headers, body_base64: result.bodyBase64, truncated: result.truncated };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await this.writeAccessAudit(input, { ...base, error: errMsg });
      throw new RemoteActionError(errMsg, 502);
    }
  }

  private writeAccessAudit(input: EwsProxyInput, metadata: Record<string, unknown>) {
    return this.audit.write({ action: "REMOTE_EWS_ACCESS", targetId: input.agentId, userId: input.userId, ipAddress: input.ipAddress, metadata });
  }

  private async assertEligibleDevice(agentId: string, deviceId: string) {
    const agent = await this.repo.findEwsAgent(agentId);
    if (!agent) throw new RemoteActionError("Agente no encontrado", 404);
    if (!agent.remote_ews_enabled) throw new RemoteActionError("Remote EWS no está habilitado para este agente", 403);
    const device = await this.repo.findEwsDevice(agentId, deviceId);
    if (!device) throw new RemoteActionError("Dispositivo no encontrado para este agente", 404);
    if (!device.ip_address) throw new RemoteActionError("El dispositivo no tiene una IP registrada todavía", 409);
    const staleThresholdMs = 2 * (agent.scan_interval_minutes || 15) * 60 * 1000;
    const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
    if (Date.now() - lastSeenMs > staleThresholdMs) {
      throw new RemoteActionError("El dispositivo no reportó recientemente — la IP podría haber sido reasignada. Esperá al próximo scan.", 409);
    }
    return device;
  }
}
