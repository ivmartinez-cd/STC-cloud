import type { CountRow } from "../repositories/dashboard-repository";

export function computeDeviceTrend(devicesCount: CountRow | undefined, newDevicesCount: CountRow | undefined) {
  const total = Number(devicesCount?.c || 0);
  const added = Number(newDevicesCount?.c || 0);
  const previousTotal = total - added;
  if (added <= 0) return { total, deviceTrend: null as string | null };
  const pct = previousTotal > 0 ? Math.round((added / previousTotal) * 100) : 100;
  return { total, deviceTrend: `+${pct}% este mes` };
}
