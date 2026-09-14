import { resolveSupplyOrigin } from "../../../../services/supplyOrigin";
import { logger } from "../../../../logger";
import type { IncomingReading, MappedReading } from "../../domain/entities/agent";
import type { IngestDeviceRepository } from "../../domain/repositories/ingest-device-repository";
import { buildExistingDeviceUpdate, buildNewDeviceInsert, resolveExistingDeviceFields } from "../../domain/services/device-row-builders";
import {
  buildMappedReading, computeDisplayFields, detectCounterResets, normalizeBrand, parseCount, parseRawIdentity,
  resolveReadingTime, type DisplayFields,
} from "../../domain/services/reading-parsing";
import { newAgentId } from "../../domain/services/tokens";
import { NETWORK_BOARD_RESET_ALERT, isPlaceholderMac, networkBoardResetMessage } from "../../domain/services/network-board";
import type { AlertNotifier } from "../ports/alert-notifier";
import type { DeviceIdentityResolver, DeviceMerger } from "../ports/device-identity";

export interface IngestContext {
  agentId: string;
  clientId: string | null;
  approvalRequired: boolean;
  timezone: string;
}

/**
 * Procesa UNA lectura del sync: resuelve el equipo por identidad de cliente,
 * lo actualiza o lo crea, abre/cierra alertas derivadas y devuelve la fila
 * lista para `readings`. MISMO orden y MISMAS decisiones que el
 * `processReading` original de `sync-reading.ts` — extracción mecánica.
 * `null` = lectura suprimida (`disabled`/`ignored`) o error (ya logueado).
 */
export class ProcessReadingUseCase {
  constructor(
    private readonly devices: IngestDeviceRepository,
    private readonly identity: DeviceIdentityResolver,
    private readonly alerts: AlertNotifier,
    private readonly merger: DeviceMerger,
    private readonly onFailure: (agentId: string, message: string, timezone: string) => Promise<void>
  ) {}

  async execute(ctx: IngestContext, r: IncomingReading): Promise<MappedReading | null> {
    try {
      const { ip, serialToUse } = parseRawIdentity(r);
      const existingDevice = await this.resolveExistingDevice(ctx, ip, serialToUse, r.mac);
      const brand = normalizeBrand(r.brand, r.model);
      const display = computeDisplayFields(r, brand, serialToUse, ip);

      let deviceId: string;
      if (existingDevice) {
        const result = await this.upsertExisting(r, existingDevice, ip, brand, display, serialToUse);
        if (result.suppressed) return null;
        deviceId = result.deviceId;
      } else {
        deviceId = await this.insertNew(r, ctx, ip, serialToUse, brand, display);
      }

      await this.warnIfDecommissionedStillReporting(deviceId, existingDevice);
      await this.syncNetworkBoardAlert(ctx.clientId, deviceId, r.mac);
      await this.syncEwsAlerts(deviceId, r.supplies_details);
      await this.mergeGhostDevicesByIp(ctx.agentId, deviceId, ip);
      return buildMappedReading(r, deviceId, resolveReadingTime(r.time, ctx.timezone));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      logger.error({ err: errMsg }, `[SYNC] Error procesando dispositivo ${r.device_id}`);
      // Continuamos con el resto de la tanda para no bloquear todo el agente
      if (ctx.agentId) await this.onFailure(ctx.agentId, `Device Sync Fail [${r.ip || r.device_id}]: ${errMsg}`, ctx.timezone);
      return null;
    }
  }

  /** Identidad de CLIENTE (serial → mac → ip); fallback legacy por agente si el agente es huérfano. */
  private async resolveExistingDevice(ctx: IngestContext, ip: string, serialToUse: string | null, mac: string | null | undefined): Promise<any> {
    if (ctx.clientId && (ip || serialToUse)) {
      return this.identity.resolve({ clientId: ctx.clientId, agentId: ctx.agentId, serial: serialToUse, mac: mac ?? null, ip });
    }
    if (ip || serialToUse) return this.devices.findLegacyByAgent(ctx.agentId, ip, serialToUse);
    return null;
  }

  /**
   * `disabled` (Fase 5) e `ignored` (Fase 7): sólo señal de "sigue vivo", sin
   * tocar contadores ni insertar la lectura. `supplies_only`/`reports_only`/
   * `pending` NO cortan acá (lossless, R1).
   */
  private async upsertExisting(
    r: IncomingReading, existingDevice: any, ip: string, brand: string, display: DisplayFields, serialToUse: string | null
  ): Promise<{ deviceId: string; suppressed: boolean }> {
    const deviceId = existingDevice.id;
    if (existingDevice.monitor_state === "disabled" || existingDevice.registration_state === "ignored") {
      await this.devices.update(deviceId, { ip_address: ip || existingDevice.ip_address, last_seen: new Date(), active: true });
      return { deviceId, suppressed: true };
    }
    const fields = resolveExistingDeviceFields(existingDevice, display.cleanModel, serialToUse, ip, display.validHost);
    const { counterResets, resetValue } = detectCounterResets(existingDevice, parseCount(r.total_pages), parseCount(r.mono_pages), parseCount(r.color_pages), display.pollMethod);
    // Fase 10: `resolvedOrigin` es null cuando no hay señal (nunca se pisa `supply_origin` en ese caso).
    const resolvedOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
    const originChanged = resolvedOrigin !== null && resolvedOrigin !== existingDevice.supply_origin;

    await this.devices.update(deviceId, buildExistingDeviceUpdate(r, existingDevice, ip, brand, fields, display.pollMethod, resolvedOrigin, originChanged));
    if (counterResets.length > 0) await this.openCounterResetAlert(deviceId, counterResets, resetValue);
    await this.handleSupplyOriginAlerts(deviceId, originChanged, resolvedOrigin);
    return { deviceId, suppressed: false };
  }

  private async insertNew(r: IncomingReading, ctx: IngestContext, ip: string, serialToUse: string | null, brand: string, display: DisplayFields): Promise<string> {
    const deviceId = newAgentId();
    const newDeviceOrigin = resolveSupplyOrigin(r.supply_origin, r.supplies_details);
    await this.devices.insert(buildNewDeviceInsert(r, deviceId, ctx.agentId, ctx.clientId, ctx.approvalRequired, ip, serialToUse, brand, display, newDeviceOrigin));
    if (newDeviceOrigin === "non_genuine") await this.openSupplyNonGenuine(deviceId);
    return deviceId;
  }

  // Alerta de EVENTO con dedupe por (device_id,type): un segundo reset mientras el primero sigue abierto queda suprimido a propósito.
  private openCounterResetAlert(deviceId: string, counterResets: string[], resetValue: number | null): Promise<void> {
    return this.alerts.open({
      deviceId, type: "counter_reset", severity: "critical",
      message: `Contador(es) con reset o decremento detectado: ${counterResets.join(", ")}`, value: resetValue,
    });
  }

  // Fase 10 — alerta de ESTADO: se abre al transicionar a no-original y se resuelve sola si vuelve a genuine.
  private async handleSupplyOriginAlerts(deviceId: string, originChanged: boolean, resolvedOrigin: string | null): Promise<void> {
    if (originChanged && resolvedOrigin === "non_genuine") await this.openSupplyNonGenuine(deviceId);
    else if (originChanged && resolvedOrigin === "genuine") await this.alerts.resolve({ deviceId, type: "supply_non_genuine" });
  }

  private openSupplyNonGenuine(deviceId: string): Promise<void> {
    return this.alerts.open({ deviceId, type: "supply_non_genuine", severity: "warning", message: "Se detectó un consumible no original instalado", value: null });
  }

  /**
   * Alerta de ESTADO: se abre mientras el equipo reporte una MAC de relleno
   * (placa de red reseteada en taller) y se resuelve sola cuando vuelve a
   * reportar una MAC propia. Sin MAC en la lectura no se afirma nada.
   */
  private async syncNetworkBoardAlert(clientId: string | null, deviceId: string, mac: string | null | undefined): Promise<void> {
    if (!clientId || !mac) return;
    const others = await this.devices.countOtherLiveDevicesWithMac(clientId, mac, deviceId);
    if (isPlaceholderMac(mac, others)) {
      await this.alerts.open({ deviceId, type: NETWORK_BOARD_RESET_ALERT, severity: "warning", message: networkBoardResetMessage(mac) });
    } else {
      await this.alerts.resolve({ deviceId, type: NETWORK_BOARD_RESET_ALERT });
    }
  }

  // El matcher nunca revive una baja: se avisa en vez de reactivar en silencio.
  private async warnIfDecommissionedStillReporting(deviceId: string, existingDevice: any): Promise<void> {
    if (!existingDevice?.decommissioned_at) return;
    await this.alerts.open({ deviceId, type: "device_still_reporting", severity: "warning", message: "Equipo dado de baja pero sigue reportando lecturas" });
  }

  // Alertas EWS: dedupe por `type` + auto-resolución de las que ya no aparecen en la lista actual.
  private async syncEwsAlerts(deviceId: string, suppliesDetailsRaw: unknown): Promise<void> {
    const suppliesObj = typeof suppliesDetailsRaw === "string" ? JSON.parse(suppliesDetailsRaw) : suppliesDetailsRaw;
    if (!(suppliesObj?.alerts && Array.isArray(suppliesObj.alerts))) return;
    const currentTypes: string[] = [];
    for (const alertItem of suppliesObj.alerts) {
      if (!(alertItem.description || alertItem.code)) continue;
      const alertMsg = alertItem.description || alertItem.code;
      const alertType = this.alerts.synthesizeEwsAlertType(alertItem.code, alertMsg);
      const sevLower = String(alertItem.severity || "").toLowerCase();
      const alertSev = (sevLower === "critical" || sevLower === "error" || sevLower === "danger") ? "critical" : "warning";
      currentTypes.push(alertType);
      await this.alerts.open({ deviceId, type: alertType, severity: alertSev, message: alertMsg, origin: "device" });
    }
    await this.alerts.resolveStaleDeviceAlerts({ deviceId, currentTypes });
  }

  // Consolidar fantasmas duplicados en esta IP vía la primitiva única de fusión (lápida, nunca DELETE).
  private async mergeGhostDevicesByIp(agentId: string, deviceId: string, ip: string): Promise<void> {
    if (!ip) return;
    for (const ghostId of await this.devices.ghostIdsByIp(agentId, deviceId, ip)) {
      try {
        await this.merger.mergeGhost({ targetId: deviceId, sourceId: ghostId });
      } catch (mergeErr: unknown) {
        // No debe tumbar la ingesta — un fantasma sin fusionar queda para revisión manual en /devices/duplicates.
        logger.error({ err: mergeErr }, `[SYNC] No se pudo fusionar fantasma ${ghostId} -> ${deviceId}`);
      }
    }
  }
}
