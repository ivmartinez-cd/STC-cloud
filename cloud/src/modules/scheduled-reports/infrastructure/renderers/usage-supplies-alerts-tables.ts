import type { Knex } from "knex";
import type { RenderedTable } from "../../application/ports/report-renderer";
import { computePeriodUsage, formatPeriod, parsePeriod } from "../../../reports";
import { fleetSupplies, type FleetSupplyRow } from "../../../supplies";
import { KnexDeviceCostsRepository, periodCost, type DeviceCosts } from "../../../device-costs";

const MAX_ROWS = 5000;

function fmtDate(d: Date | string | null): string | null {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : null;
}

/** "YYYY-MM" del mes anterior al actual (el caso de uso real del SDS: contadores del mes cerrado). */
function previousPeriod(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const USAGE_COLUMNS = ["Serie", "Marca", "Modelo", "Monitor", "Primera lectura", "Última lectura",
  "Total inicial", "Total final", "Δ Total", "Δ Mono", "Δ Color", "Reset de contador"];
// Fase 4.5: billing figures — solo se agregan si algún equipo del cliente tiene costes cargados.
const COST_COLUMNS = ["Coste mono", "Coste color", "Coste total"];

function usageRow(l: Awaited<ReturnType<typeof computePeriodUsage>>[number]): (string | number | null)[] {
  return [l.serial_number, l.brand, l.model, l.agent_name,
    fmtDate(l.first_reading_at), fmtDate(l.last_reading_at),
    l.first_total, l.last_total, l.delta_total, l.delta_mono, l.delta_color,
    l.had_counter_reset ? "Sí" : "No"];
}

function costCells(costs: DeviceCosts | undefined, deltaMono: number, deltaColor: number): (number | null)[] {
  if (!costs) return [null, null, null];
  const c = periodCost(costs, deltaMono, deltaColor);
  return [c.mono, c.color, c.total];
}

/** Informe de uso (contadores del período) — requiere cliente. Con costes
 * cargados (Fase 4.5), suma las columnas de billing figures del SDS. */
export async function usageTable(
  db: Knex,
  params: { title: string; clientId: string | null; period?: string }
): Promise<RenderedTable> {
  if (!params.clientId) throw new Error("El informe de uso requiere un cliente");
  const period = params.period ?? previousPeriod(new Date());
  parsePeriod(period); // valida formato YYYY-MM antes de tocar la base
  const lines = await computePeriodUsage(db, { clientId: params.clientId, period });
  const costsMap = await new KnexDeviceCostsRepository(db).mapByClient(params.clientId);
  const withCosts = costsMap.size > 0;
  return {
    title: `${params.title} ${formatPeriod(parsePeriod(period).periodStart)}`,
    columns: withCosts ? [...USAGE_COLUMNS, ...COST_COLUMNS] : USAGE_COLUMNS,
    rows: lines.map((l) => withCosts
      ? [...usageRow(l), ...costCells(costsMap.get(l.device_id), l.delta_mono, l.delta_color)]
      : usageRow(l)),
    truncated: 0,
  };
}

const SUPPLY_COLUMNS = ["Cliente", "Serie", "Modelo", "Tipo", "Color", "Descripción", "SKU",
  "Nivel %", "Páginas restantes", "Días restantes", "Última señal"];

function supplyRow(s: FleetSupplyRow): (string | number | null)[] {
  return [s.client_name, s.device_serial, s.device_model, s.kind, s.color, s.description,
    s.code, s.percentage, s.remainingPages, s.remainingDays, fmtDate(s.last_seen)];
}

/** Informe de niveles de consumibles (consumable-levels del SDS). */
export async function consumableLevelsTable(
  db: Knex,
  params: { title: string; clientId: string | null; maxPercentage?: number; maxDays?: number }
): Promise<RenderedTable> {
  const { items, total } = await fleetSupplies(db, {
    clientId: params.clientId ?? undefined,
    maxPercentage: params.maxPercentage,
    maxDays: params.maxDays,
    limit: 200,
    offset: 0,
  });
  return {
    title: params.title,
    columns: SUPPLY_COLUMNS,
    rows: items.map(supplyRow),
    truncated: Math.max(0, total - items.length),
  };
}

const ALERT_COLUMNS = ["Cliente", "Serie", "Código", "Clase", "Motivo", "Severidad",
  "Apertura", "Resuelta", "Resolución"];

/* eslint-disable @typescript-eslint/no-explicit-any */
type AlertRow = Record<string, any>;

function alertRow(r: AlertRow): (string | number | null)[] {
  return [r.client, r.serial_number, r.type, r.alert_class, r.alert_reason, r.severity,
    fmtDate(r.created_at), r.resolved ? "Sí" : "No", fmtDate(r.resolved_at)];
}

function alertHistoryQuery(
  db: Knex,
  params: { clientId: string | null; days: number; alertClass?: string }
): Knex.QueryBuilder {
  const cutoff = new Date(Date.now() - params.days * 24 * 3600 * 1000);
  const q = db("alerts")
    .leftJoin("devices", "devices.id", "alerts.device_id")
    .leftJoin("agents", "agents.id", "alerts.agent_id")
    .leftJoin("clients", "clients.id", db.raw("COALESCE(devices.client_id, agents.client_id)"))
    .where("alerts.created_at", ">=", cutoff)
    .select("clients.name as client", "devices.serial_number", "alerts.type",
      "alerts.alert_class", "alerts.alert_reason", "alerts.severity",
      "alerts.created_at", "alerts.resolved", "alerts.resolved_at")
    .orderBy("alerts.created_at", "desc")
    .limit(MAX_ROWS + 1);
  if (params.clientId) q.where("clients.id", params.clientId);
  if (params.alertClass) q.where("alerts.alert_class", params.alertClass);
  return q;
}

/** Historial de alertas de los últimos N días (alert-history del SDS). */
export async function alertHistoryTable(
  db: Knex,
  params: { title: string; clientId: string | null; days: number; alertClass?: string }
): Promise<RenderedTable> {
  const rows: AlertRow[] = await alertHistoryQuery(db, params);
  return {
    title: params.title,
    columns: ALERT_COLUMNS,
    rows: rows.slice(0, MAX_ROWS).map(alertRow),
    truncated: rows.length > MAX_ROWS ? 1 : 0,
  };
}
