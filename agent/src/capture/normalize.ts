/**
 * Aplana un `CaptureResult` (rico, por scope) al contrato `DeviceReading` del servidor.
 * Es el único lugar donde se conoce el mapeo camelCase → snake_case de columnas.
 */
import type { CaptureResult, DeviceIdentity, TonerColor, SuppliesDetails, ModelProfile } from './types';
import type { DeviceReading } from './reading';
import { worstSupplyOrigin } from './supplyOrigin';

const COLORS: readonly TonerColor[] = ['black', 'cyan', 'magenta', 'yellow'];

export function toDeviceReading(identity: DeviceIdentity, result: CaptureResult | null, profile?: ModelProfile): DeviceReading {
  const id = { ...identity, ...(result?.identity ?? {}) };
  const model = (id.model ?? profile?.displayName ?? id.brand ?? 'unknown').slice(0, 100);
  const reading: DeviceReading = {
    ip:          identity.ip,
    brand:       id.brand ?? identity.brand,
    model,
    sysDescr:    (id.sysDescr ?? '').slice(0, 255),
    sysName:     id.sysName ?? id.hostname ?? '',
    serial:      id.serial ?? null,
    total_pages: result?.meters?.total ?? null,
    mono_pages:  result?.meters?.mono  ?? null,
    color_pages: result?.meters?.color ?? null,
    toner_black: null, toner_cyan: null, toner_magenta: null, toner_yellow: null,
    firmware:    id.firmware ?? null,
    mac:         id.mac ?? null,
    hostname:    id.hostname ?? id.sysName ?? null,
    location:    id.location ?? null,
    time:        new Date().toISOString(),
    poll_method: result?.meters?.source ?? result?.method ?? identity.source ?? 'unknown',
  };

  // Equipo declarado mono: el total es la verdad; algunos firmwares (HP M428 fabricado por Samsung) reportan
  // MonochromeImpressions inconsistente. Nunca hay color.
  if (reading.total_pages !== null && profile?.expect?.color === false) {
    reading.mono_pages = reading.total_pages; reading.color_pages = 0;
  }
  if (reading.total_pages === null && reading.mono_pages !== null) {
    reading.total_pages = reading.mono_pages + (reading.color_pages ?? 0);
  }

  const sd: SuppliesDetails = {};
  if (result?.supplies) {
    const s = result.supplies;
    const toners: NonNullable<SuppliesDetails['toners']> = {};
    for (const c of COLORS) {
      const t = s.toners[c];
      if (!t) continue;
      toners[c] = t;
      reading[`toner_${c}`]              = t.percentage ?? null;
      reading[`cartridge_code_${c}`]     = t.code ?? null;
      reading[`cartridge_serial_${c}`]   = t.serial ?? null;
      reading[`cartridge_capacity_${c}`] = t.capacity ?? null;
      reading[`cartridge_printed_${c}`]  = t.printed ?? null;
      reading[`cartridge_estimated_${c}`]= t.remainingPages ?? null;
    }
    if (Object.keys(toners).length) sd.toners = toners;
    if (s.drums)       sd.drums = s.drums;
    if (s.maintenance) sd.maintenance = s.maintenance;
    // Fase 10 del gap analysis vs HP SDS — roll-up peor-caso de los 4 tóners.
    const origin = worstSupplyOrigin(COLORS.map((c) => s.toners[c]?.origin));
    if (origin) reading.supply_origin = origin;
  }
  if (result?.meters?.detail) sd.counters = result.meters.detail;
  if (result?.device || id.sku) sd.device = { ...(result?.device ?? {}), ...(id.sku ? { sku: id.sku } : {}) };
  if (result?.alerts?.length) sd.alerts = result.alerts;
  const cleanTray = <T extends { name: string; paperSize?: string | null; paperType?: string | null }>(t: T): T | null => {
    const bad = (v: string | null | undefined) => !!v && (v.length > 40 || /[{}();=<>\[\]]|function|var\s/i.test(v));
    if (!t.name || bad(t.name)) return null;
    return { ...t, paperSize: bad(t.paperSize) ? null : t.paperSize, paperType: bad(t.paperType) ? null : t.paperType };
  };
  const inTrays  = (result?.trays?.input ?? []).map(cleanTray).filter((t): t is NonNullable<typeof t> => t !== null);
  const outTrays = (result?.trays?.output ?? []).map(cleanTray).filter((t): t is NonNullable<typeof t> => t !== null);
  if (inTrays.length)  sd.inputTrays  = inTrays;
  if (outTrays.length) sd.outputTrays = outTrays;
  reading.supplies_details = Object.keys(sd).length ? sd : null;
  return reading;
}
