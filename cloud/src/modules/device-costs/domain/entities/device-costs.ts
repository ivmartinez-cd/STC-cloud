/**
 * Dominio de costes por equipo (Fase 4.5 del gap analysis vs HP SDS). Puro.
 */

export interface DeviceCosts {
  deviceId: string;
  capitalCost: number | null;
  quarterlyRental: number | null;
  monoPageCost: number | null;
  colorPageCost: number | null;
  serviceContractCost: number | null;
  serviceContractYears: number | null;
  currency: string;
  updatedBy: string | null;
  updatedAt: Date;
}

export type DeviceCostsWrite = Omit<DeviceCosts, "deviceId" | "updatedBy" | "updatedAt">;

/** Coste estimado del período dado un delta de páginas (los "billing figures"). */
export function periodCost(
  costs: Pick<DeviceCosts, "monoPageCost" | "colorPageCost">,
  deltaMono: number,
  deltaColor: number
): { mono: number | null; color: number | null; total: number | null } {
  const mono = costs.monoPageCost != null ? round2(deltaMono * costs.monoPageCost) : null;
  const color = costs.colorPageCost != null ? round2(deltaColor * costs.colorPageCost) : null;
  const total = mono == null && color == null ? null : round2((mono ?? 0) + (color ?? 0));
  return { mono, color, total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
