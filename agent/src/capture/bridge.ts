/**
 * Puente entre los parsers EWS existentes (`Partial<EwsData>`, formato plano camelCase)
 * y el contrato rico `CaptureResult`. Permite reutilizar los parsers probados por marca
 * sin duplicar regex en las familias.
 */
import type { EwsData } from '../snmp/ews-parsers/types';
import type { CaptureResult, PollMethod, SuppliesReading, SuppliesItem, TonerColor, AlertItem, DeviceIdentity, InputTrayInfo } from './types';

const COLORS: readonly TonerColor[] = ['black', 'cyan', 'magenta', 'yellow'];
const CAP: Record<TonerColor, 'Black' | 'Cyan' | 'Magenta' | 'Yellow'> = { black: 'Black', cyan: 'Cyan', magenta: 'Magenta', yellow: 'Yellow' };

function pick<T>(...vals: Array<T | null | undefined>): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return undefined;
}

/** Convierte un `Partial<EwsData>` en `CaptureResult`. Sólo crea los scopes que tienen datos. */
export function fromEwsData(d: Partial<EwsData>, method: PollMethod): CaptureResult {
  const out: CaptureResult = { method };

  const identity: Partial<DeviceIdentity> = {};
  if (d.brand)    identity.brand    = d.brand;
  if (d.model)    identity.model    = d.model;
  if (d.serial)   identity.serial   = d.serial;
  if (d.mac)      identity.mac      = d.mac;
  if (d.hostname) identity.hostname = d.hostname;
  if (d.location) identity.location = d.location;
  if (d.firmware) identity.firmware = d.firmware;
  if (Object.keys(identity).length) out.identity = identity;
  if (d.suppliesDetails?.device) out.device = d.suppliesDetails.device;

  if (d.totalPages != null || d.monoPages != null || d.colorPages != null) {
    out.meters = {
      total:  d.totalPages ?? null,
      mono:   d.monoPages  ?? null,
      color:  d.colorPages ?? null,
      detail: d.suppliesDetails?.counters,
      source: method,
    };
  }

  const toners: SuppliesReading['toners'] = {};
  let hasSupplies = false;
  for (const c of COLORS) {
    const k = CAP[c];
    const fromDetails = d.suppliesDetails?.toners?.[c];
    const item: SuppliesItem = {
      percentage:     pick(d[`toner${k}`], fromDetails?.percentage) ?? null,
      status:         fromDetails?.status ?? null,
      code:           pick(d[`cartridgeCode${k}`], fromDetails?.code) ?? null,
      serial:         pick(d[`cartridgeSerial${k}`], fromDetails?.serial) ?? null,
      capacity:       pick(d[`cartridgeCapacity${k}`], fromDetails?.capacity) ?? null,
      printed:        pick(d[`cartridgePrinted${k}`], fromDetails?.printed) ?? null,
      remainingPages: pick(d[`cartridgeEstimated${k}`], fromDetails?.remainingPages) ?? null,
      orderNumber:    fromDetails?.orderNumber ?? null,
      firstInstallDate: fromDetails?.firstInstallDate ?? null,
      lastUseDate:    fromDetails?.lastUseDate ?? null,
      // Fase 10 del gap analysis vs HP SDS — sin equivalente plano `d.origin*`
      // (a diferencia de percentage/code/serial): sólo llega vía `suppliesDetails`.
      origin:         fromDetails?.origin ?? null,
    };
    if (item.percentage != null || item.code || item.serial || item.capacity != null) {
      toners[c] = item;
      hasSupplies = true;
    }
  }
  const drums = d.suppliesDetails?.drums;
  const maintenance = d.suppliesDetails?.maintenance;
  if (hasSupplies || drums || maintenance) {
    out.supplies = { toners, drums, maintenance, source: method };
  }

  if (d.suppliesDetails?.alerts?.length) out.alerts = d.suppliesDetails.alerts as AlertItem[];

  if (d.suppliesDetails?.inputTrays?.length || d.suppliesDetails?.outputTrays?.length) {
    out.trays = { input: d.suppliesDetails.inputTrays, output: d.suppliesDetails.outputTrays, source: method };
  }
  return out;
}

/**
 * Fusiona resultados por scope: `primary` gana campo a campo; `secondary` rellena huecos.
 * Se usa para componer "mejor dato por campo entre fuentes" (EWS + SNMP + PJL), que es lo que
 * hacen los DCA comerciales en lugar de elegir un único protocolo por dispositivo.
 */
export function mergeResults(primary: CaptureResult | null, secondary: CaptureResult | null): CaptureResult | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const out: CaptureResult = { method: primary.method };

  out.identity = { ...(secondary.identity ?? {}), ...compact(primary.identity ?? {}) };
  if (!Object.keys(out.identity).length) delete out.identity;

  if (primary.meters || secondary.meters) {
    const p = primary.meters, s = secondary.meters;
    out.meters = {
      total:  p?.total  ?? s?.total  ?? null,
      mono:   p?.mono   ?? s?.mono   ?? null,
      color:  p?.color  ?? s?.color  ?? null,
      detail: (p?.detail || s?.detail) ? { ...(s?.detail ?? {}), ...compact(p?.detail ?? {}) } : undefined,
      source: (p?.total != null ? p.source : s?.source) ?? primary.method,
    };
  }

  if (primary.supplies || secondary.supplies) {
    const toners: SuppliesReading['toners'] = {};
    for (const c of COLORS) {
      const p = primary.supplies?.toners[c], s = secondary.supplies?.toners[c];
      if (!p && !s) continue;
      toners[c] = {
        percentage:     p?.percentage     ?? s?.percentage     ?? null,
        status:         p?.status         ?? s?.status         ?? null,
        code:           p?.code           ?? s?.code           ?? null,
        orderNumber:    p?.orderNumber    ?? s?.orderNumber    ?? null,
        serial:         p?.serial         ?? s?.serial         ?? null,
        capacity:       p?.capacity       ?? s?.capacity       ?? null,
        printed:        p?.printed        ?? s?.printed        ?? null,
        remainingPages: p?.remainingPages ?? s?.remainingPages ?? null,
        remainingDays:  p?.remainingDays  ?? s?.remainingDays  ?? null,
        firstInstallDate: p?.firstInstallDate ?? s?.firstInstallDate ?? null,
        lastUseDate:    p?.lastUseDate    ?? s?.lastUseDate    ?? null,
        // Fase 10 del gap analysis vs HP SDS.
        origin:         p?.origin         ?? s?.origin         ?? null,
      };
    }
    out.supplies = {
      toners,
      drums:       primary.supplies?.drums       ?? secondary.supplies?.drums,
      maintenance: primary.supplies?.maintenance ?? secondary.supplies?.maintenance,
      source:      primary.supplies?.source      ?? secondary.supplies?.source ?? primary.method,
    };
  }

  if (primary.alerts?.length || secondary.alerts?.length) {
    const seen = new Set<string>();
    out.alerts = [...(primary.alerts ?? []), ...(secondary.alerts ?? [])].filter(a => {
      const key = `${a.code ?? ''}|${(a.description ?? '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  if (primary.trays || secondary.trays) {
    const norm = (n: string) => n.toLowerCase().replace(/bandeja|tray|\s+/g, '').replace(/^(\d+)$/, 'tray$1');
    const merged = new Map<string, InputTrayInfo>();
    for (const t of secondary.trays?.input ?? []) merged.set(norm(t.name), { ...t });
    for (const t of primary.trays?.input ?? []) {
      const k = norm(t.name); const prev = merged.get(k);
      merged.set(k, prev ? { ...prev, ...compact(t) } : { ...t });
    }
    out.trays = {
      input:  merged.size ? [...merged.values()] : undefined,
      output: primary.trays?.output ?? secondary.trays?.output,
      source: primary.trays?.source ?? secondary.trays?.source ?? primary.method,
    };
  }
  if (primary.device || secondary.device) out.device = { ...(secondary.device ?? {}), ...compact(primary.device ?? {}) };
  return out;
}

/** Spread que ignora `undefined`/`null` del objeto de la derecha (no pisa datos ya obtenidos). */
export function mergeDefined<T extends object>(base: T, extra: Partial<T>): T {
  const out: T = { ...base };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}

/**
 * Mergea `suppliesDetails.counters` de dos fuentes campo a campo (no reemplaza el objeto
 * entero): dos endpoints del mismo equipo pueden aportar sub-campos distintos de counters
 * (p. ej. Samsung SyncThru counters.json trae monoSimplex/duplex/totalImpressions y
 * countersView.sws trae print/copy/fax) — ver fix del desglose por función del M5370LX.
 */
export function mergeCountersInto(
  target: { counters?: import('../snmp/ews-parsers/types').DetailedCounters },
  extra: import('../snmp/ews-parsers/types').DetailedCounters | undefined,
): void {
  if (!extra) return;
  target.counters = { ...(target.counters ?? {}), ...extra };
}

function compact<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '') (r as Record<string, unknown>)[k] = v;
  return r;
}
