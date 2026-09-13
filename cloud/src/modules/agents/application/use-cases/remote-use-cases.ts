import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { AgentLink } from "../ports/agent-link";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { EwsProxyGateway } from "../ports/ews-proxy-gateway";
import type { EwsSessionStore } from "../ports/ews-session-store";
import type { Actor, EwsProxyInput, EwsProxyOutput, SendCommandInput } from "../dtos/agent-dtos";
import type { AgentCommandsUseCase } from "./command-use-cases";
import { AppError } from "../../../../shared/domain/errors";

export class RemoteActionError extends AppError {
  constructor(message: string, public readonly statusCode: number) { super(message); }
}

/**
 * Cuánto puede hacer que un equipo no reporta y aun así aceptar que su IP
 * sigue siendo suya. Protege del caso en que DHCP se la reasignó a otro host.
 *
 * El piso de 6 h no es arbitrario: `devices.last_seen` NO se mueve al ritmo
 * del intervalo de scan sino al de los loops que traen lecturas (contadores
 * 20/240 min, insumos 60/240), así que medir sólo contra `2× scan_interval`
 * comparaba contra un reloj distinto del que mueve el dato. Con el intervalo
 * en 15 la ventana daba 30 min y un equipo sano que había reportado hacía 48
 * quedaba rechazado: la función era inusable (verificado contra el parque
 * real el 13/09/2026).
 *
 * 6 h sigue siendo protección de verdad —una concesión DHCP corporativa dura
 * horas o días, y un equipo que no reporta hace 6 h está apagado— y no es la
 * única capa: el agente revalida la IP contra su catálogo local antes de
 * conectar.
 */
function staleWindowMs(scanIntervalMinutes: number | null): number {
  return Math.max(2 * (scanIntervalMinutes || 15) * 60 * 1000, 6 * 60 * 60 * 1000);
}

/**
 * Las cuatro condiciones que habilitan alcanzar la EWS de un equipo, en el
 * único lugar donde viven: el flag opt-in del monitor, que el equipo sea de
 * ese monitor, que tenga IP registrada, y que esa IP no esté vieja.
 *
 * Compartida entre el visor de una página (`EwsProxyUseCase`) y el gateway
 * navegable (`OpenEwsSessionUseCase`) a propósito: si alguna vez se relaja
 * una, tiene que relajarse para los dos o para ninguno — dos copias de esta
 * lógica es exactamente cómo se abre un agujero sin que nadie lo note.
 */
export async function assertEligibleEwsDevice(repo: AgentPortalRepository, agentId: string, deviceId: string) {
  const agent = await repo.findEwsAgent(agentId);
  if (!agent) throw new RemoteActionError("Agente no encontrado", 404);
  if (!agent.remote_ews_enabled) throw new RemoteActionError("Remote EWS no está habilitado para este agente", 403);
  const device = await repo.findEwsDevice(agentId, deviceId);
  if (!device) throw new RemoteActionError("Dispositivo no encontrado para este agente", 404);
  // Se extrae a una const para que el tipo de retorno quede con `ip_address: string`:
  // los callers no tienen por qué volver a chequear algo que acá ya se garantizó.
  const ipAddress = device.ip_address;
  if (!ipAddress) throw new RemoteActionError("El dispositivo no tiene una IP registrada todavía", 409);
  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
  if (Date.now() - lastSeenMs > staleWindowMs(agent.scan_interval_minutes)) {
    throw new RemoteActionError("El dispositivo no reportó recientemente — la IP podría haber sido reasignada. Esperá al próximo scan.", 409);
  }
  return { ...device, ip_address: ipAddress };
}

/** Comando remoto genérico: persiste en `agent_commands`, audita y empuja por WSS si el agente está conectado. */
export class SendAgentCommandUseCase {
  constructor(
    private readonly commands: AgentCommandsUseCase, private readonly link: AgentLink,
    private readonly audit: AuditLogWriter, private readonly agents: AgentRepository
  ) {}

  async execute(input: SendCommandInput): Promise<{ success: true; commandId: string; instant: boolean }> {
    const payload = input.payload || {};
    const command = await this.commands.add(input.agentId, input.type, payload, input.userId ?? undefined);
    const agent = await this.agents.findById(input.agentId);
    await this.audit.write({
      action: "AGENT_COMMAND", targetId: input.agentId, clientId: agent?.client_id ?? null,
      userId: input.userId, ipAddress: input.ipAddress, metadata: { type: input.type, payload },
    });
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
  constructor(
    private readonly commands: AgentCommandsUseCase, private readonly link: AgentLink,
    private readonly audit: AuditLogWriter, private readonly agents: AgentRepository
  ) {}

  async execute(agentId: string, actor: Actor): Promise<{ status: "success"; message: string }> {
    const sentInstant = this.link.pushCommand(agentId, "RESCAN");
    await this.commands.add(agentId, "RESCAN");
    const agent = await this.agents.findById(agentId);
    await this.audit.write({
      action: "AGENT_COMMAND", targetId: agentId, clientId: agent?.client_id ?? null,
      userId: actor.userId, ipAddress: actor.ipAddress, metadata: { type: "RESCAN", payload: {} },
    });
    return { status: "success", message: sentInstant ? "Comando enviado instantáneamente vía WSS" : "Agente offline. Comando encolado para próximo latido." };
  }
}

/**
 * Toggle auditado por separado del uso (`REMOTE_EWS_TOGGLE` vs `REMOTE_EWS_ACCESS`).
 * Deshabilitar cierra en el acto las sesiones navegables abiertas contra los
 * equipos de ese monitor: apagar el permiso tiene que apagar el túnel, no
 * dejarlo vivo hasta 30 minutos más.
 */
export class SetRemoteEwsEnabledUseCase {
  constructor(
    private readonly repo: AgentPortalRepository, private readonly audit: AuditLogWriter,
    private readonly agents: AgentRepository, private readonly sessions: EwsSessionStore
  ) {}

  async execute(agentId: string, enabled: boolean, actor: Actor): Promise<{ ok: true; remote_ews_enabled: boolean; sessions_closed: number }> {
    if ((await this.repo.setRemoteEwsEnabled(agentId, enabled)) === 0) throw new RemoteActionError("Agente no encontrado", 404);
    const sessionsClosed = enabled ? 0 : await this.sessions.destroyAllForAgent(agentId);
    const agent = await this.agents.findById(agentId);
    await this.audit.write({
      action: "REMOTE_EWS_TOGGLE", targetId: agentId, clientId: agent?.client_id ?? null,
      userId: actor.userId, ipAddress: actor.ipAddress, metadata: { enabled, sessions_closed: sessionsClosed },
    });
    return { ok: true, remote_ews_enabled: enabled, sessions_closed: sessionsClosed };
  }
}

/** Cierre a pedido, desde el portal, de todas las sesiones de EWS abiertas contra los equipos de un monitor. */
export class CloseEwsSessionsUseCase {
  constructor(
    private readonly sessions: EwsSessionStore, private readonly audit: AuditLogWriter,
    private readonly agents: AgentRepository
  ) {}

  async execute(agentId: string, actor: Actor): Promise<{ ok: true; sessions_closed: number }> {
    const agent = await this.agents.findById(agentId);
    if (!agent) throw new RemoteActionError("Agente no encontrado", 404);
    const sessionsClosed = await this.sessions.destroyAllForAgent(agentId);
    await this.audit.write({
      action: "REMOTE_EWS_SESSION_CLOSE", targetId: agentId, clientId: agent.client_id ?? null,
      userId: actor.userId, ipAddress: actor.ipAddress, metadata: { sessions_closed: sessionsClosed },
    });
    return { ok: true, sessions_closed: sessionsClosed };
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
    private readonly audit: AuditLogWriter,
    private readonly agents: AgentRepository
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

  private async writeAccessAudit(input: EwsProxyInput, metadata: Record<string, unknown>) {
    const agent = await this.agents.findById(input.agentId);
    return this.audit.write({
      action: "REMOTE_EWS_ACCESS", targetId: input.agentId, clientId: agent?.client_id ?? null,
      userId: input.userId, ipAddress: input.ipAddress, metadata,
    });
  }

  private assertEligibleDevice(agentId: string, deviceId: string) {
    return assertEligibleEwsDevice(this.repo, agentId, deviceId);
  }
}
