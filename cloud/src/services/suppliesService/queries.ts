import { Knex } from "knex";
import { alertableDevices } from "../../api/utils/deviceFilters";
import { buildSupplyRows, parseSuppliesDetails } from "./row-builder";
import { EMPTY_RATE, type FleetSupplyRow, type SupplyKind, type SupplyRow, type UsageRate } from "./types";

/**
 * Ritmo de impresión de los últimos 30 días — reusa `device_usage_30d`
 * (vista creada en la Fase 4, `SUM(GREATEST(delta,0))` sobre
 * `readings_daily_agg`, mismo criterio anti-reset que el volumen mensual del
 * dashboard/reportService) en vez de reimplementar el cálculo de deltas acá.
 * Una sola query para N dispositivos — nunca N+1.
 */
export async function usageRatesFor(db: Knex, deviceIds: string[]): Promise<Map<string, UsageRate>> {
  const map = new Map<string, UsageRate>();
  if (deviceIds.length === 0) return map;
  const rows = await db("device_usage_30d").whereIn("device_id", deviceIds);
  for (const r of rows) {
    map.set(r.device_id, {
      totalPerDay: r.pages_30d != null ? Number(r.pages_30d) / 30 : null,
      colorPerDay: r.color_30d != null ? Number(r.color_30d) / 30 : null,
      monoPerDay: r.mono_30d != null ? Number(r.mono_30d) / 30 : null,
      spanDays: 30,
    });
  }
  return map;
}

export async function deviceSupplies(db: Knex, deviceId: string): Promise<{ rate: UsageRate; rows: SupplyRow[] } | null> {
  const device = await db("devices").where({ id: deviceId }).first();
  if (!device) return null;
  const rateMap = await usageRatesFor(db, [deviceId]);
  const rate = rateMap.get(deviceId) ?? EMPTY_RATE;
  const rows = buildSupplyRows(device, parseSuppliesDetails(device.supplies_details), rate);
  return { rate, rows };
}

// Techo de seguridad, mismo criterio que listClients/listAgents/listDevices
// (auditoría de capacidad 23/08/2026) — no es paginación real de dispositivos,
// sólo evita construir filas para una flota sin límite antes de filtrar/paginar.
const FLEET_DEVICE_CAP = 3000;

async function fetchFleetDevices(db: Knex, params: { clientId?: string | null; agentId?: string | null }) {
  return db("devices")
    .leftJoin("clients", "clients.id", "devices.client_id")
    .leftJoin("agents", "agents.id", "devices.agent_id")
    // `alertableDevices` (vivo + monitor_state en full/supplies_only), no
    // `onlyLiveDevices` a secas: un equipo `disabled` no debe aparecer acá —
    // mismo criterio que `alertService.openAlert` ya aplica para alertas de
    // tóner sobre el mismo equipo (Fase 5). `reports_only` tampoco: ese
    // estado es "sólo contadores", análogo a "no monitorear consumibles".
    .modify((q) => alertableDevices(q, "devices"))
    .modify((q) => {
      if (params.clientId) q.where("devices.client_id", params.clientId);
      if (params.agentId) q.where("devices.agent_id", params.agentId);
    })
    .select(
      "devices.*",
      "clients.id as client_id_join", "clients.name as client_name",
      "agents.name as agent_name"
    )
    .limit(FLEET_DEVICE_CAP);
}

function toFleetRow(row: SupplyRow, d: Record<string, any>): FleetSupplyRow {
  return {
    ...row,
    device_id: d.id,
    device_serial: d.serial_number ?? null,
    device_model: d.model ?? null,
    device_brand: d.brand ?? null,
    client_id: d.client_id ?? null,
    client_name: d.client_name ?? null,
    agent_name: d.agent_name ?? null,
    last_seen: d.last_seen ?? null,
  };
}

async function buildFleetRows(db: Knex, params: { clientId?: string | null; agentId?: string | null }): Promise<FleetSupplyRow[]> {
  const devices = await fetchFleetDevices(db, params);
  const ids = devices.map((d: Record<string, any>) => d.id as string);
  const rateMap = await usageRatesFor(db, ids);

  const rows: FleetSupplyRow[] = [];
  for (const d of devices as Array<Record<string, any>>) {
    const rate = rateMap.get(d.id) ?? EMPTY_RATE;
    const details = parseSuppliesDetails(d.supplies_details);
    for (const row of buildSupplyRows(d, details, rate)) {
      rows.push(toFleetRow(row, d));
    }
  }
  return rows;
}

export interface FleetSuppliesParams {
  clientId?: string | null;
  agentId?: string | null;
  kind?: SupplyKind | null;
  maxPercentage?: number | null;
  maxDays?: number | null;
  limit?: number;
  offset?: number;
}

export async function fleetSupplies(db: Knex, params: FleetSuppliesParams): Promise<{ items: FleetSupplyRow[]; total: number }> {
  let rows = await buildFleetRows(db, params);
  if (params.kind) rows = rows.filter((r) => r.kind === params.kind);
  if (params.maxPercentage != null) rows = rows.filter((r) => r.percentage != null && r.percentage <= params.maxPercentage!);
  if (params.maxDays != null) rows = rows.filter((r) => r.remainingDays != null && r.remainingDays <= params.maxDays!);
  // Más urgente primero — sin dato de restantes al final, no arriba (no es "urgente", es "desconocido").
  rows.sort((a, b) => (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity));

  const total = rows.length;
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = Math.max(params.offset ?? 0, 0);
  return { items: rows.slice(offset, offset + limit), total };
}

/** Cuántos ítems de TODA la flota caen a partir de `pct%` — usado por el
 * endpoint de impacto de Configuración (handoff hifi #3, fase 2, 26/08/2026)
 * para mostrar "esto afecta a N ítems" mientras el admin mueve el slider,
 * ANTES de guardar. Deliberadamente no reusa `CRITICAL_PCT`/`LOW_PCT` de acá
 * abajo — son los umbrales fijos de la vista de Consumibles, un concepto
 * distinto del umbral global configurable. */
export async function suppliesCountBelowThreshold(db: Knex, pct: number): Promise<number> {
  const rows = await buildFleetRows(db, {});
  return rows.filter((r) => r.percentage != null && r.percentage <= pct).length;
}

const CRITICAL_PCT = 10;
const LOW_PCT = 20;

export async function suppliesSummary(db: Knex, params: { clientId?: string | null; agentId?: string | null }): Promise<{
  criticalCount: number; lowCount: number; top: FleetSupplyRow[];
}> {
  const rows = await buildFleetRows(db, params);
  const withPct = rows.filter((r) => r.percentage != null);
  const criticalCount = withPct.filter((r) => r.percentage! <= CRITICAL_PCT).length;
  const lowCount = withPct.filter((r) => r.percentage! > CRITICAL_PCT && r.percentage! <= LOW_PCT).length;
  const top = [...rows]
    .filter((r) => r.percentage != null && r.percentage <= LOW_PCT)
    .sort((a, b) => (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity))
    .slice(0, 5);
  return { criticalCount, lowCount, top };
}
