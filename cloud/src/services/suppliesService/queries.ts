import { Knex } from "knex";
import { alertableDevices } from "../../api/utils/deviceFilters";
import { OPEN_STATUSES } from "../../modules/supply-requests";
import { buildSupplyRows, parseSuppliesDetails } from "./row-builder";
import { EMPTY_RATE, type FleetSupplyRow, type SupplyKind, type SupplyRow, type SupplyUrgency, type UsageRate } from "./types";

/** Umbrales del handoff hifi #3 (26/08/2026) — antes 10%/20%, alineados acá a
 * 15%/35% para que coincidan con la tira de métricas y la barra de NIVEL
 * RESTANTE de la pantalla de Consumibles. Único lugar donde viven: la vista
 * de Consumibles y su resumen los consumen de acá, nunca los redefinen. */
const CRITICAL_PCT = 15;
const LOW_PCT = 35;

function urgencyOf(pct: number | null): SupplyUrgency {
  if (pct == null) return "sin_lectura";
  if (pct <= CRITICAL_PCT) return "critico";
  if (pct <= LOW_PCT) return "bajo";
  return "normal";
}

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
    urgency: urgencyOf(row.percentage),
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
  /** Buscador (handoff hifi #3, fase 3, 26/08/2026) — SKU, serie, modelo o cliente. */
  query?: string | null;
  urgency?: SupplyUrgency | null;
  limit?: number;
  offset?: number;
}

function applyFleetFilters(rows: FleetSupplyRow[], params: FleetSuppliesParams): FleetSupplyRow[] {
  let out = rows;
  if (params.kind) out = out.filter((r) => r.kind === params.kind);
  if (params.maxPercentage != null) out = out.filter((r) => r.percentage != null && r.percentage <= params.maxPercentage!);
  if (params.maxDays != null) out = out.filter((r) => r.remainingDays != null && r.remainingDays <= params.maxDays!);
  if (params.urgency) out = out.filter((r) => r.urgency === params.urgency);
  if (params.query) {
    const q = params.query.trim().toLowerCase();
    out = out.filter((r) =>
      (r.code ?? '').toLowerCase().includes(q) || (r.device_serial ?? '').toLowerCase().includes(q) ||
      (r.device_model ?? '').toLowerCase().includes(q) || (r.client_name ?? '').toLowerCase().includes(q)
    );
  }
  return out;
}

export async function fleetSupplies(db: Knex, params: FleetSuppliesParams): Promise<{ items: FleetSupplyRow[]; total: number }> {
  const rows = applyFleetFilters(await buildFleetRows(db, params), params);
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
 * ANTES de guardar. Deliberadamente no reusa `CRITICAL_PCT`/`LOW_PCT` —
 * son los umbrales fijos de la vista de Consumibles, un concepto distinto
 * del umbral global configurable. */
export async function suppliesCountBelowThreshold(db: Knex, pct: number): Promise<number> {
  const rows = await buildFleetRows(db, {});
  return rows.filter((r) => r.percentage != null && r.percentage <= pct).length;
}

async function openSupplyRequestsCount(db: Knex, params: { clientId?: string | null; agentId?: string | null }): Promise<number> {
  const [{ n }] = await db("supply_requests")
    .whereIn("status", OPEN_STATUSES as readonly string[])
    .modify((q) => {
      if (params.clientId) q.where("client_id", params.clientId);
      if (params.agentId) q.where("agent_id", params.agentId);
    })
    .count("* as n");
  return Number(n);
}

export interface SuppliesSummary {
  total: number;
  criticalCount: number;
  lowCount: number;
  noReadingCount: number;
  openOrders: number;
  top: FleetSupplyRow[];
}

/** Tira de 5 métricas de Consumibles (handoff hifi #3, fase 3, 26/08/2026):
 * ítems monitoreados, críticos, nivel bajo, sin lectura SNMP y pedidos
 * abiertos — todo calculado en servidor sobre la misma pasada de filas que
 * ya recorría `criticalCount`/`lowCount`, para que la tira y la tabla nunca
 * muestren números distintos. */
export async function suppliesSummary(db: Knex, params: { clientId?: string | null; agentId?: string | null }): Promise<SuppliesSummary> {
  const [rows, openOrders] = await Promise.all([buildFleetRows(db, params), openSupplyRequestsCount(db, params)]);
  const criticalCount = rows.filter((r) => r.urgency === "critico").length;
  const lowCount = rows.filter((r) => r.urgency === "bajo").length;
  const noReadingCount = rows.filter((r) => r.urgency === "sin_lectura").length;
  const top = [...rows]
    .filter((r) => r.percentage != null && r.percentage <= LOW_PCT)
    .sort((a, b) => (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity))
    .slice(0, 5);
  return { total: rows.length, criticalCount, lowCount, noReadingCount, openOrders, top };
}
