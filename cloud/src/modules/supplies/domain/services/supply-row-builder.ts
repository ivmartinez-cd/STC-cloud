import type { SupplyColor, SupplyKind, SuppliesDetails, SuppliesItem, SupplyRow, UsageRate } from "../entities/supply-row";

type TonerKey = "black" | "cyan" | "magenta" | "yellow";
const TONER_META: Array<{ key: TonerKey; label: SupplyColor; cls: string }> = [
  { key: "black", label: "Negro", cls: "bg-slate-900" },
  { key: "cyan", label: "Cian", cls: "bg-cyan-500" },
  { key: "magenta", label: "Magenta", cls: "bg-pink-500" },
  { key: "yellow", label: "Amarillo", cls: "bg-yellow-400" },
];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysFor(remainingPages: number | null, perDay: number | null): number | null {
  if (remainingPages == null || perDay == null || perDay <= 0) return null;
  return Math.round(remainingPages / perDay);
}

function itemRow(
  key: string, description: string, kind: SupplyKind, color: SupplyColor, cls: string,
  item: SuppliesItem | undefined, perDay: number | null
): SupplyRow | null {
  if (!item) return null;
  const pct = num(item.percentage);
  const capacity = num(item.capacity);
  const remainingPages = num(item.remainingPages) ?? (capacity != null && pct != null ? Math.round((capacity * pct) / 100) : null);
  return {
    key, description, kind, color, colorClass: cls,
    percentage: pct,
    status: item.status ?? null,
    code: item.code ?? null,
    orderNumber: item.orderNumber ?? null,
    serial: item.serial ?? null,
    capacity,
    printed: num(item.printed),
    remainingPages,
    remainingDays: num(item.remainingDays) ?? daysFor(remainingPages, perDay),
    firstInstallDate: item.firstInstallDate ?? null,
    lastUseDate: item.lastUseDate ?? null,
  };
}

export function parseSuppliesDetails(raw: unknown): SuppliesDetails | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as SuppliesDetails;
  try { return JSON.parse(raw as string) as SuppliesDetails; } catch { return null; }
}

function buildTonerRows(device: Record<string, unknown>, details: SuppliesDetails | null, rate: UsageRate): SupplyRow[] {
  const rows: SupplyRow[] = [];
  for (const m of TONER_META) {
    const K = m.key;
    const fromDetails = details?.toners?.[K];
    const flat: SuppliesItem = {
      percentage: (device[`toner_${K}`] as number | null | undefined) ?? null,
      code: (device[`cartridge_code_${K}`] as string | null | undefined) ?? null,
      serial: (device[`cartridge_serial_${K}`] as string | null | undefined) ?? null,
      capacity: (device[`cartridge_capacity_${K}`] as number | null | undefined) ?? null,
      printed: (device[`cartridge_printed_${K}`] as number | null | undefined) ?? null,
      remainingPages: (device[`cartridge_estimated_${K}`] as number | null | undefined) ?? null,
    };
    const merged: SuppliesItem | undefined = (fromDetails || flat.percentage != null || flat.code)
      ? { ...flat, ...Object.fromEntries(Object.entries(fromDetails ?? {}).filter(([, v]) => v !== null && v !== undefined)) }
      : undefined;
    if (!merged) continue;
    // En equipos color, el negro se consume en todas las páginas; CMY según el ritmo de color.
    const perDay = K === "black" ? rate.totalPerDay : (rate.colorPerDay ?? rate.totalPerDay);
    const row = itemRow(`toner-${K}`, `Cartucho de tóner ${m.label.toLowerCase()}`, "Tóner", m.label, m.cls, merged, perDay);
    if (row) rows.push(row);
  }
  return rows;
}

function buildMaintenanceRows(details: SuppliesDetails | null, rate: UsageRate): SupplyRow[] {
  const rows: SupplyRow[] = [];
  const mt = details?.maintenance;
  const named: Array<[string, string, SupplyKind]> = [
    ["fuser", "Fusor", "Fusor"], ["transferBelt", "Banda de transferencia", "Banda de transferencia"], ["transferRoller", "Rodillo de transferencia", "Rodillo"],
    ["tray1Roller", "Rodillo bandeja 1", "Rodillo"], ["tray1RetardRoller", "Rodillo de retardo bandeja 1", "Rodillo"],
    ["mpTrayRoller", "Rodillo bandeja multiuso", "Rodillo"], ["mpTrayRetardRoller", "Rodillo de retardo bandeja multiuso", "Rodillo"],
    ["wasteToner", "Depósito de tóner residual", "Depósito de residuos"],
  ];
  for (const [k, label, kind] of named) {
    const item = (mt as Record<string, SuppliesItem | undefined> | undefined)?.[k];
    if (!item) continue;
    const row = itemRow(`mt-${k}`, label, kind, "Sin color", "bg-slate-400", item, rate.totalPerDay);
    if (row) rows.push(row);
  }
  for (const o of mt?.other ?? []) {
    const row = itemRow(`mt-other-${o.name}`, o.name, "Kit de mantenimiento", "Sin color", "bg-slate-400", { percentage: o.percentage, status: o.status, capacity: o.maxCapacity }, rate.totalPerDay);
    if (row) rows.push(row);
  }
  return rows;
}

/** Construye las filas reales de un equipo. `device` aporta las columnas planas como fallback de los tóners. */
export function buildSupplyRows(device: Record<string, unknown>, details: SuppliesDetails | null, rate: UsageRate): SupplyRow[] {
  const rows: SupplyRow[] = buildTonerRows(device, details, rate);

  for (const m of TONER_META) {
    const row = itemRow(`drum-${m.key}`, `Unidad de imagen ${m.label.toLowerCase()}`, "Tambor de imagen", m.label, m.cls, details?.drums?.[m.key], rate.totalPerDay);
    if (row) rows.push(row);
  }

  rows.push(...buildMaintenanceRows(details, rate));

  return rows;
}
