import type { Knex } from "knex";
import type { RenderedTable } from "../../application/ports/report-renderer";
import { onlyLiveDevices } from "../../../../api/utils/deviceFilters";

const MAX_ROWS = 5000;

function fmtDate(d: Date | string | null): string | null {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function truncate(rows: Row[]): { rows: Row[]; truncated: number } {
  return rows.length > MAX_ROWS
    ? { rows: rows.slice(0, MAX_ROWS), truncated: rows.length - MAX_ROWS }
    : { rows, truncated: 0 };
}

function baseDeviceQuery(db: Knex, clientId: string | null): Knex.QueryBuilder {
  const q = db("devices")
    .join("clients", "clients.id", "devices.client_id")
    .leftJoin("agents", "agents.id", "devices.agent_id")
    .modify((qb) => onlyLiveDevices(qb));
  if (clientId) q.where("devices.client_id", clientId);
  return q;
}

const ASSET_COLUMNS = ["Cliente", "Serie", "Marca", "Modelo", "IP", "Hostname", "Estado monitor",
  "Nº activo", "Nº etiqueta", "Ubicación", "Monitor", "Última señal"];

function assetRow(r: Row): (string | number | null)[] {
  return [r.client, r.serial_number, r.brand, r.model, r.ip_address, r.hostname,
    r.monitor_state, r.asset_number, r.asset_tag, r.location, r.agent, fmtDate(r.last_seen)];
}

/** Informe "Lista de activos" (equivalente al asset-list del SDS). */
export async function assetListTable(
  db: Knex,
  params: { title: string; clientId: string | null }
): Promise<RenderedTable> {
  const rows = await baseDeviceQuery(db, params.clientId)
    .select(
      "clients.name as client", "devices.serial_number", "devices.brand", "devices.model",
      "devices.ip_address", "devices.hostname", "devices.monitor_state",
      "devices.asset_number", "devices.asset_tag", "devices.location",
      "agents.name as agent", "devices.last_seen"
    )
    .orderBy(["clients.name", "devices.serial_number"]);
  const { rows: capped, truncated } = truncate(rows as Row[]);
  return { title: params.title, columns: ASSET_COLUMNS, rows: capped.map(assetRow), truncated };
}

const OFFLINE_COLUMNS = ["Cliente", "Serie", "Marca", "Modelo", "IP", "Monitor",
  "Última señal", "Días sin señal"];

function offlineRow(r: Row): (string | number | null)[] {
  const days = r.last_seen
    ? Math.floor((Date.now() - new Date(r.last_seen).getTime()) / 86400000)
    : null;
  return [r.client, r.serial_number, r.brand, r.model, r.ip_address, r.agent,
    fmtDate(r.last_seen), days];
}

/** Informe "Dispositivos sin contacto" (non-contactable del SDS). */
export async function nonContactableTable(
  db: Knex,
  params: { title: string; clientId: string | null; offlineDays: number }
): Promise<RenderedTable> {
  const cutoff = new Date(Date.now() - params.offlineDays * 24 * 3600 * 1000);
  const rows = await baseDeviceQuery(db, params.clientId)
    .where((qb) => qb.where("devices.last_seen", "<", cutoff).orWhereNull("devices.last_seen"))
    .select(
      "clients.name as client", "devices.serial_number", "devices.brand", "devices.model",
      "devices.ip_address", "agents.name as agent", "devices.last_seen"
    )
    .orderBy("devices.last_seen", "asc");
  const { rows: capped, truncated } = truncate(rows as Row[]);
  return { title: params.title, columns: OFFLINE_COLUMNS, rows: capped.map(offlineRow), truncated };
}
