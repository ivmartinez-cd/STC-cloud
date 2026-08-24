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

function deviceFieldFrom(sd: unknown, field: string, maxLen: number): string | null {
  try {
    const obj = typeof sd === "string" ? JSON.parse(sd) as unknown : sd;
    if (obj && typeof obj === "object") {
      const dev = (obj as { device?: Record<string, unknown> }).device;
      const value = dev?.[field];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, maxLen);
    }
  } catch { /* ignore */ }
  return null;
}

/** Extrae supplies_details.device.sku (objeto o string JSON) con tipado seguro. */
export function skuFrom(sd: unknown): string | null {
  return deviceFieldFrom(sd, "sku", 50);
}

/** Fase 10 — `assetNumber` sólo llega hoy de HP FutureSmart; sólo llena `asset_number_reported`, nunca el override manual. */
export function assetNumberFrom(sd: unknown): string | null {
  return deviceFieldFrom(sd, "assetNumber", 64);
}

/** Parsea un jsonb que puede venir como string (columna vieja) u objeto ya parseado. */
export function parseJsonColumn<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID antes de insertar en una columna `uuid` (evita error de tipo en Postgres). */
export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
