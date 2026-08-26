import type { Knex } from "knex";
import type { DeviceScope } from "../../domain/entities/device";
import type { DeviceInventorySummary } from "../../domain/entities/device-directory";

const SUPPLY_LOW_THRESHOLD = 35;
const SUPPLY_CRITICAL_THRESHOLD = 15;
const NO_CONTACT_HOURS_MS = 5 * 3_600_000;
const REPORTING_WINDOW_MS = 24 * 3_600_000;

interface SummaryRow {
  decommissioned_at: Date | null;
  registration_state: string;
  agent_id: string | null;
  last_seen: Date | null;
  client_id: string | null;
  toner_black: number | null;
  toner_cyan: number | null;
  toner_magenta: number | null;
  toner_yellow: number | null;
}

function lowestSupply(row: SummaryRow): number | null {
  const vals = [row.toner_black, row.toner_cyan, row.toner_magenta, row.toner_yellow].filter((v): v is number => v !== null);
  return vals.length > 0 ? Math.min(...vals) : null;
}

function isReporting24h(row: SummaryRow, now: number): boolean {
  return row.last_seen !== null && now - new Date(row.last_seen).getTime() <= REPORTING_WINDOW_MS;
}

function isNoContact(row: SummaryRow, now: number): boolean {
  return row.last_seen === null || now - new Date(row.last_seen).getTime() > NO_CONTACT_HOURS_MS;
}

/** Agrega en JS sobre las filas del scope (vivas + de baja, nunca fusionadas)
 * — mismo criterio que `summarizePortfolioRows` (módulo `clients`): un solo
 * lugar cuenta lo mismo que ve la tabla, nunca dos cifras que se contradigan.
 * Los `pending` (registration_state, Fase 7) no cuentan en NINGÚN bucket —
 * misma exclusión que `onlyLiveDevices` aplica al listado principal. */
export function summarizeInventoryRows(rows: SummaryRow[], now = Date.now()): DeviceInventorySummary {
  const live = rows.filter((r) => r.decommissioned_at === null && r.registration_state === "registered");
  const decommissioned = rows.filter((r) => r.decommissioned_at !== null).length;
  return {
    devices_total: live.length,
    devices_managed: live.filter((r) => r.agent_id !== null).length,
    reporting_24h: live.filter((r) => isReporting24h(r, now)).length,
    no_contact: live.filter((r) => isNoContact(r, now)).length,
    supply_critical: live.filter((r) => { const p = lowestSupply(r); return p !== null && p <= SUPPLY_CRITICAL_THRESHOLD; }).length,
    supply_low: live.filter((r) => { const p = lowestSupply(r); return p !== null && p <= SUPPLY_LOW_THRESHOLD; }).length,
    decommissioned,
    clients_total: new Set(live.map((r) => r.client_id)).size,
  };
}

export async function getDeviceInventorySummary(db: Knex, scope: DeviceScope): Promise<DeviceInventorySummary> {
  const rows: SummaryRow[] = await db("devices")
    .whereNull("merged_into")
    .modify((q) => { if (scope.kind === "client") q.where("client_id", scope.id); })
    .select(
      "decommissioned_at", "registration_state", "agent_id", "last_seen", "client_id",
      "toner_black", "toner_cyan", "toner_magenta", "toner_yellow"
    );
  return summarizeInventoryRows(rows);
}
