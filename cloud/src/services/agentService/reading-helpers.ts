import crypto from "crypto";

/**
 * Genera un hash SHA-256 de un token para almacenamiento seguro en base de datos.
 * Se utiliza para almacenar refresh tokens sin exponer el valor original.
 * @param token - Token de texto plano a hashear.
 * @returns Hash hexadecimal de 64 caracteres.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Fusión por secciones de supplies_details. Cada loop del agente es dueño de un grupo de claves:
 *  - loop de insumos  (trae `toners`)   → reemplaza toners/drums/maintenance/alerts/inputTrays/outputTrays
 *  - loop de contadores (trae `counters`) → reemplaza counters
 *  - `device` se fusiona clave a clave.
 * Así un kit que el equipo dejó de reportar (o datos viejos de otro parser) no queda "pegado" para siempre.
 */
export function mergeSuppliesDetails(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  if ("toners" in incoming) {
    for (const k of ["toners", "drums", "maintenance", "alerts", "inputTrays", "outputTrays"]) delete out[k];
  }
  if ("counters" in incoming) delete out["counters"];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null) continue;
    if (k === "device" && typeof v === "object" && typeof out["device"] === "object" && out["device"]) {
      out["device"] = { ...(out["device"] as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Extrae supplies_details.device.sku (objeto o string JSON) con tipado seguro. */
export function skuFrom(sd: unknown): string | null {
  try {
    const obj = typeof sd === "string" ? JSON.parse(sd) as unknown : sd;
    if (obj && typeof obj === "object") {
      const dev = (obj as { device?: { sku?: unknown } }).device;
      const sku = dev?.sku;
      if (typeof sku === "string" && sku.trim()) return sku.trim().slice(0, 50);
    }
  } catch { /* ignore */ }
  return null;
}

/** Fase 10 del gap analysis vs HP SDS — `assetNumber` sólo llega hoy de HP
 *  FutureSmart (`DeviceInformation/View#AssetNumber`), casi siempre vacío
 *  (nadie lo carga por default). Sólo llena `asset_number_reported`, nunca
 *  `asset_number_override` — un operador que ya seteó el override manual
 *  desde el portal no lo pierde porque el equipo empezó a reportar algo. */
export function assetNumberFrom(sd: unknown): string | null {
  try {
    const obj = typeof sd === "string" ? JSON.parse(sd) as unknown : sd;
    if (obj && typeof obj === "object") {
      const dev = (obj as { device?: { assetNumber?: unknown } }).device;
      const a = dev?.assetNumber;
      if (typeof a === "string" && a.trim()) return a.trim().slice(0, 64);
    }
  } catch { /* ignore */ }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID antes de insertar en una columna `uuid` (evita error de tipo en Postgres). */
export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Ejecuta `fn` sobre `items` con un techo de tareas concurrentes (no todas a
 * la vez, no una por una). Usado en `syncReadings` para no mantener una
 * conexión del pool ocupada todo el tiempo que dura procesar un lote grande
 * en serie — sin librería externa, un pool simple de N workers que van
 * tomando el próximo item de la cola.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
