import { logger } from "../../../../logger";
import type { IncomingDevice } from "../../domain/entities/agent";
import type { AgentRepository } from "../../domain/repositories/agent-repository";
import type { IngestDeviceRepository } from "../../domain/repositories/ingest-device-repository";
import { newAgentId } from "../../domain/services/tokens";
import type { IngestTransactionScope, IngestUnitOfWork } from "../ports/ingest-unit-of-work";

/**
 * Alta/actualización de dispositivos descubiertos por el agente (`POST
 * /devices/register`). Identidad por CLIENTE (serial → mac → ip). ESTE es el
 * camino donde de verdad nace una fila nueva de `devices`, por eso el gate
 * `device_approval_required` (Fase 7) vive acá. El `catch` de `23505`
 * reintenta el lookup una vez (carrera entre dos registros concurrentes).
 */
export class RegisterDevicesFromAgentUseCase {
  constructor(
    private readonly agents: AgentRepository,
    /** Sin transacción — sólo para el fallback legacy por agente. */
    private readonly devices: IngestDeviceRepository,
    private readonly unitOfWork: IngestUnitOfWork
  ) {}

  async execute(agentId: string, devices: IncomingDevice[]): Promise<void> {
    const { clientId, approvalRequired } = await this.agents.clientContext(agentId);
    for (const device of devices) {
      try {
        if (!clientId) { await this.registerLegacyByAgent(agentId, device); continue; }
        await this.upsertWithRetry(agentId, clientId, approvalRequired, device);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error({ err: errMsg }, `[AGENT_SERVICE] Error registering device ${device.ip}`);
      }
    }
  }

  private async upsertWithRetry(agentId: string, clientId: string, approvalRequired: boolean, device: IncomingDevice): Promise<void> {
    try {
      await this.upsert(agentId, clientId, approvalRequired, device);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate key|23505/i.test(msg)) throw err;
      // Carrera con otro registro concurrente: ahora debería resolver por el lookup en vez de insertar.
      await this.upsert(agentId, clientId, approvalRequired, device);
    }
  }

  /** Resolver + escribir en UNA transacción (el advisory lock de la identidad se sostiene hasta el commit). */
  private upsert(agentId: string, clientId: string, approvalRequired: boolean, device: IncomingDevice): Promise<void> {
    return this.unitOfWork.run((tx) => upsertInTransaction(tx, agentId, clientId, approvalRequired, device));
  }

  /** Fallback legacy (scopeado por agente) para un agente sin client_id — no esperado en producción. */
  private async registerLegacyByAgent(agentId: string, device: IncomingDevice): Promise<void> {
    const ip = device.ip;
    const serial = (device.serial || "").trim();
    const isRealSerial = serial.length > 0 && serial !== ip;
    const existingIds = await this.devices.findLegacyIdsByAgentIp(agentId, ip);
    if (existingIds.length > 0) {
      await this.devices.update(existingIds[0], { serial_number: isRealSerial ? serial : undefined, last_seen: new Date(), active: true });
      return;
    }
    await this.devices.insert({
      id: newAgentId(), agent_id: agentId, ip_address: ip, serial_number: isRealSerial ? serial : null,
      brand: device.brand || "unknown", model: (device.model || "").slice(0, 100), name_reported: (device.name || "").slice(0, 100),
      active: true, last_seen: new Date(),
    });
  }
}

async function upsertInTransaction(tx: IngestTransactionScope, agentId: string, clientId: string, approvalRequired: boolean, device: IncomingDevice): Promise<void> {
  const ip = device.ip;
  const serial = (device.serial || "").trim() || null;
  const mac = device.mac ?? null;
  const existing = await tx.identity.resolve({ clientId, agentId, serial, mac, ip });
  if (existing) {
    // `ignored` (Fase 7): no revivir por su cuenta — sólo señal de "sigue vivo".
    if (existing.registration_state === "ignored") {
      await tx.devices.update(existing.id, { ip_address: ip || existing.ip_address, last_seen: new Date(), active: true });
      return;
    }
    await tx.devices.update(existing.id, {
      ip_address: ip || existing.ip_address,
      serial_number: serial || existing.serial_number,
      mac: mac || existing.mac,
      brand: device.brand && device.brand !== "unknown" ? device.brand : undefined,
      model: device.model || undefined,
      name_reported: device.name || undefined,
      last_seen: new Date(),
      active: true,
    });
    return;
  }
  await tx.devices.insert({
    id: newAgentId(), agent_id: agentId, client_id: clientId, ip_address: device.ip, serial_number: serial, mac,
    brand: device.brand || "unknown", model: (device.model || "").slice(0, 100), name_reported: (device.name || "").slice(0, 100),
    active: true, last_seen: new Date(), registration_state: approvalRequired ? "pending" : "registered",
  });
}
