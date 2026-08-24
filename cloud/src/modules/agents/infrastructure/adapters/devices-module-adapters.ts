import type { Knex } from "knex";
import { mergeDevices, resolveDeviceIdentity } from "../../../devices";
import type { DeviceIdentityResolver, DeviceMerger, GhostMergeParams, IdentityLookup } from "../../application/ports/device-identity";

/** Identidad por cliente en una transacción propia (el advisory lock serializa agentes concurrentes). */
export class DevicesModuleIdentityResolver implements DeviceIdentityResolver {
  constructor(private readonly db: Knex) {}

  async resolve(params: IdentityLookup): Promise<any | null> {
    const { device } = await this.db.transaction((trx) => resolveDeviceIdentity(trx, params));
    return device;
  }
}

/** Fusión de fantasmas desde la ingesta vía la primitiva única (lápida, nunca DELETE). */
export class DevicesModuleMerger implements DeviceMerger {
  constructor(private readonly db: Knex) {}

  async mergeGhost(params: GhostMergeParams): Promise<void> {
    await mergeDevices(this.db, { targetId: params.targetId, sourceId: params.sourceId, reason: "ghost_ip", actor: "ingest", onOverlap: "keep_target" });
  }
}
