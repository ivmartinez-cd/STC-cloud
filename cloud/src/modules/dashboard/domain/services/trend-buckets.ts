import type { DashboardTrend, SnapshotRow, TrendPoint, TrendRange } from "../entities/dashboard-snapshot";

/**
 * Pliega las tomas horarias de `dashboard_snapshots` en la serie que dibuja el
 * panel. Puro y sin knex a propósito: la aritmética de "qué es un bucket" y
 * "qué pasa si a un bucket le falta un cliente" es la parte que puede mentir,
 * y se testea sola.
 *
 * Reglas:
 * - Un bucket toma, por cliente, la ÚLTIMA toma que cae adentro (no el
 *   promedio): las cifras del panel son de estado ("cuántas alertas hay
 *   abiertas"), no de flujo, así que un bucket vale lo que valía al cerrar.
 * - El punto es la SUMA de los clientes del scope. Si a alguno le falta el
 *   valor (toma sin medir esa métrica — el caso del backfill), el punto entero
 *   queda `null` para esa métrica: mejor un hueco en la serie que un total que
 *   suma sólo la mitad de la flota y parece una caída.
 * - Buckets diarios en hora de Buenos Aires — mismo criterio que
 *   `alertDigestJob.ts`: los contenedores corren en UTC, y cortar el día a las
 *   21:00 locales haría que "vs. ayer" no signifique ayer.
 */

const TZ = "America/Argentina/Buenos_Aires";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export interface RangeSpec {
  bucket: "hour" | "day";
  /** Cuántos buckets tiene la ventana, contando el actual. */
  count: number;
  windowMs: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function rangeSpec(range: TrendRange): RangeSpec {
  if (range === "24h") return { bucket: "hour", count: 24, windowMs: 24 * HOUR_MS };
  if (range === "7d") return { bucket: "day", count: 7, windowMs: 7 * DAY_MS };
  return { bucket: "day", count: 30, windowMs: 30 * DAY_MS };
}

function bucketKey(at: Date, bucket: "hour" | "day"): string {
  if (bucket === "day") return DAY_KEY.format(at);
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS).toISOString();
}

/** Última toma de cada (bucket, cliente) — las filas llegan ordenadas por `at`. */
function lastPerClient(rows: SnapshotRow[], bucket: "hour" | "day"): Map<string, Map<string, SnapshotRow>> {
  const buckets = new Map<string, Map<string, SnapshotRow>>();
  for (const row of rows) {
    const key = bucketKey(row.at, bucket);
    let byClient = buckets.get(key);
    if (!byClient) buckets.set(key, (byClient = new Map()));
    const seen = byClient.get(row.clientId);
    if (!seen || seen.at <= row.at) byClient.set(row.clientId, row);
  }
  return buckets;
}

/** Suma con propagación de `null`: si a cualquiera le falta el dato, no hay total. */
function sumOrNull(values: Array<number | null>): number | null {
  let total = 0;
  for (const v of values) {
    if (v == null) return null;
    total += v;
  }
  return total;
}

function mergeAlertClasses(rows: SnapshotRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    for (const [cls, n] of Object.entries(row.alertsByClass)) out[cls] = (out[cls] ?? 0) + n;
  }
  return out;
}

function toPoint(rows: SnapshotRow[]): TrendPoint {
  const alertsByClass = mergeAlertClasses(rows);
  return {
    at: rows.reduce((max, r) => (r.at > max ? r.at : max), rows[0].at).toISOString(),
    alertsByClass,
    alerts: Object.values(alertsByClass).reduce((a, n) => a + n, 0),
    devicesTotal: sumOrNull(rows.map((r) => r.devicesTotal)),
    devicesManaged: sumOrNull(rows.map((r) => r.devicesManaged)),
    agentsTotal: sumOrNull(rows.map((r) => r.agentsTotal)),
    agentsOnline: sumOrNull(rows.map((r) => r.agentsOnline)),
    suppliesCritical: sumOrNull(rows.map((r) => r.suppliesCritical)),
    suppliesLow: sumOrNull(rows.map((r) => r.suppliesLow)),
  };
}

/**
 * `rows` son todas las tomas de la ventana, de todos los clientes del scope,
 * ordenadas por `at` ascendente. Los buckets sin ninguna toma no aparecen: el
 * portal dibuja la serie que hay, no rellena huecos con ceros.
 */
export function buildTrend(range: TrendRange, rows: SnapshotRow[]): DashboardTrend {
  const { bucket } = rangeSpec(range);
  const points = [...lastPerClient(rows, bucket).entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, byClient]) => toPoint([...byClient.values()]));
  return { range, bucket, points };
}
