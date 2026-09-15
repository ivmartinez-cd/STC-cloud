import { Knex } from "knex";
import type {
  SupplyHistoryDevice, SupplyLevelPoint, SupplyRequestHistoryRow,
} from "../../domain/entities/supply-history";

/**
 * Techo de la serie diaria: ~3,3 años. `readings` crudo se purga a los 24
 * meses pero `readings_daily_agg` sobrevive (ver 20260823050000), así que en
 * equipos viejos la serie puede ser mucho más larga que la ventana "TODO"
 * que a alguien le sirva mirar. El portal recorta 12M/24M sobre estos mismos
 * puntos (una sola query, el selector de rango no vuelve a pegarle a la API).
 */
const SERIES_CAP_DAYS = 1200;

/** Sólo los 4 tóners tienen columna de nivel en el agregado diario. */
const LEVEL_COLUMN: Record<string, string> = {
  "toner-black": "toner_black",
  "toner-cyan": "toner_cyan",
  "toner-magenta": "toner_magenta",
  "toner-yellow": "toner_yellow",
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  // `pg` devuelve bigint/numeric como string — sin Number() las sumas concatenan.
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoDay(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** `supplies_details.counters.engineCycles` (prtMarkerLifeCount) con fallback al contador total. */
function engineCycles(details: unknown, totalPages: unknown): number | null {
  const parsed = typeof details === "string" ? safeParse(details) : (details as Record<string, unknown> | null);
  const counters = parsed?.counters as Record<string, unknown> | undefined;
  return num(counters?.engineCycles) ?? num(totalPages);
}

function safeParse(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

export async function selectHistoryDevice(db: Knex, deviceId: string): Promise<SupplyHistoryDevice | null> {
  const row = await db("devices")
    .leftJoin("clients", "clients.id", "devices.client_id")
    .where("devices.id", deviceId)
    .select(
      "devices.id", "devices.serial_number", "devices.model", "devices.brand", "devices.client_id",
      "devices.last_seen", "devices.total_pages", "devices.supplies_details", "clients.name as client_name"
    )
    .first();
  if (!row) return null;
  return {
    id: row.id, serial_number: row.serial_number ?? null, model: row.model ?? null, brand: row.brand ?? null,
    client_id: row.client_id ?? null, client_name: row.client_name ?? null, last_seen: iso(row.last_seen),
    engine_cycles: engineCycles(row.supplies_details, row.total_pages),
  };
}

export async function selectLevelSeries(db: Knex, deviceId: string, supplyKey: string): Promise<SupplyLevelPoint[]> {
  const levelCol = LEVEL_COLUMN[supplyKey] ?? null;
  const rows = await db("readings_daily_agg")
    .where({ device_id: deviceId })
    .orderBy("day", "desc")
    .limit(SERIES_CAP_DAYS)
    .select("day", "total_pages", "mono_pages", "color_pages", ...(levelCol ? [`${levelCol} as level`] : []));
  return rows
    .map((r) => ({
      day: isoDay(r.day),
      level: levelCol ? num(r.level) : null,
      total_pages: num(r.total_pages),
      mono_pages: num(r.mono_pages),
      color_pages: num(r.color_pages),
    }))
    .reverse();
}

const REQUEST_COLUMNS = [
  "id", "opened_at", "external_ref", "description", "supply_serial", "sku", "reason",
  "level_pct", "remaining_days", "mono_pages", "color_pages", "total_pages",
  "status", "origin", "replaced_at",
] as const;

export async function selectRequestHistory(
  db: Knex, deviceId: string, supplyKey: string
): Promise<SupplyRequestHistoryRow[]> {
  const rows = await db("supply_requests")
    .where({ device_id: deviceId, supply_key: supplyKey })
    .orderBy("opened_at", "asc")
    .select(...REQUEST_COLUMNS);
  return rows.map((r) => ({
    id: r.id, opened_at: iso(r.opened_at)!, external_ref: r.external_ref ?? null,
    description: r.description ?? null, supply_serial: r.supply_serial ?? null, sku: r.sku ?? null,
    reason: r.reason ?? null, level_pct: num(r.level_pct), remaining_days: num(r.remaining_days),
    mono_pages: num(r.mono_pages), color_pages: num(r.color_pages), total_pages: num(r.total_pages),
    status: r.status, origin: r.origin, replaced_at: iso(r.replaced_at),
    delta_total: null, delta_color: null,
  }));
}
