import crypto from "crypto";
import type { AgentPortalRepository } from "../../domain/repositories/agent-portal-repository";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { EwsProxyGateway, EwsProxyResponse } from "../ports/ews-proxy-gateway";
import type { EwsSession, EwsSessionStore } from "../ports/ews-session-store";
import type { Actor } from "../dtos/agent-dtos";
import { RemoteActionError, assertEligibleEwsDevice } from "./remote-use-cases";
import { mergeCookieJar as mergeJar } from "../../../../services/ewsGatewayService";

/** Igual que el visor de una página: lo que tarde más que esto es un agente caído, no un equipo lento. */
const RELAY_TIMEOUT_MS = 20_000;

export interface OpenEwsSessionInput extends Actor {
  agentId: string;
  deviceId: string;
  role: string;
}

/**
 * Abre una sesión de navegación contra la EWS de un equipo y devuelve el
 * ticket con el que el navegador cruza al origen del gateway.
 *
 * La IP se resuelve ACÁ, desde `devices`, y queda congelada en la sesión: a
 * partir de ese momento el navegador sólo maneja un identificador opaco, y
 * ninguna petición suya puede cambiar contra qué equipo se está hablando.
 */
export class OpenEwsSessionUseCase {
  constructor(
    private readonly repo: AgentPortalRepository,
    private readonly sessions: EwsSessionStore,
    private readonly audit: AuditLogWriter,
    private readonly agents: AgentRepository
  ) {}

  async execute(input: OpenEwsSessionInput): Promise<{ ticket: string }> {
    const device = await assertEligibleEwsDevice(this.repo, input.agentId, input.deviceId);
    const agent = await this.agents.findById(input.agentId);
    const sessionId = await this.sessions.create({
      userId: input.userId ?? "", role: input.role, agentId: input.agentId, deviceId: input.deviceId,
      clientId: agent?.client_id ?? null, ip: device.ip_address, label: device.model ?? device.serial_number ?? device.ip_address,
    });
    await this.audit.write({
      action: "REMOTE_EWS_SESSION_OPEN", targetId: input.agentId, clientId: agent?.client_id ?? null,
      userId: input.userId, ipAddress: input.ipAddress,
      metadata: { device_id: input.deviceId, device_ip: device.ip_address },
    });
    return { ticket: await this.sessions.mintTicket(sessionId) };
  }
}

export interface RelayEwsInput {
  sessionId: string;
  session: EwsSession;
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64?: string;
  /** Navegaciones y escrituras se auditan; los recursos de una página (imágenes, CSS) no — serían cientos de filas por pantalla. */
  audit: boolean;
}

/**
 * Relaya UNA petición del navegador contra la EWS del equipo, por el túnel
 * sobre el WSS que el agente ya tiene abierto.
 *
 * No persiste el comando en `agent_commands` a propósito, a diferencia del
 * resto de los comandos remotos: una sola pantalla del EWS dispara decenas de
 * peticiones (cada CSS, cada imagen), y una fila por cada una inundaría la
 * cola de comandos y su historial. La trazabilidad de lo que importa —qué
 * página se abrió, qué se escribió— vive en `audit_logs`.
 */
export class RelayEwsRequestUseCase {
  constructor(
    private readonly sessions: EwsSessionStore,
    private readonly gateway: EwsProxyGateway,
    private readonly audit: AuditLogWriter
  ) {}

  async execute(input: RelayEwsInput): Promise<EwsProxyResponse> {
    const { session } = input;
    const commandId = crypto.randomUUID();
    const payload = {
      ip: session.ip, path: input.path, method: input.method,
      headers: input.headers, bodyBase64: input.bodyBase64, protocol: session.protocol,
    };
    if (!(await this.gateway.pushCommand(session.agentId, commandId, payload, "EWS_REQUEST"))) {
      throw new RemoteActionError("El agente no está conectado ahora mismo", 503);
    }
    const result = await this.waitAndRemember(input, commandId);
    if (input.audit) await this.writeAudit(input, result.status);
    return result;
  }

  /** Cookies del equipo y protocolo acertado se guardan en la sesión: el navegador nunca los ve, y no se re-sondea en cada recurso. */
  private async waitAndRemember(input: RelayEwsInput, commandId: string): Promise<EwsProxyResponse> {
    let result: EwsProxyResponse;
    try {
      result = await this.gateway.waitForResult(commandId, input.session.agentId, RELAY_TIMEOUT_MS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (input.audit) await this.writeAudit(input, null, message);
      throw new RemoteActionError(message, 502);
    }
    const patch: Partial<EwsSession> = {};
    if (result.protocol && result.protocol !== input.session.protocol) patch.protocol = result.protocol;
    if (result.setCookie?.length) patch.cookies = mergeJar(input.session.cookies, result.setCookie);
    if (Object.keys(patch).length) await this.sessions.update(input.sessionId, patch);
    return result;
  }

  /** Nunca el cuerpo — ni el que va ni el que vuelve: son datos internos del cliente. Sí qué se pidió y cómo salió. */
  private writeAudit(input: RelayEwsInput, status: number | null, error?: string) {
    return this.audit.write({
      action: input.method === "GET" ? "REMOTE_EWS_ACCESS" : "REMOTE_EWS_WRITE",
      targetId: input.session.agentId, clientId: input.session.clientId,
      userId: input.session.userId || null, ipAddress: null,
      metadata: { device_id: input.session.deviceId, path: input.path, method: input.method, status, error },
    });
  }
}
