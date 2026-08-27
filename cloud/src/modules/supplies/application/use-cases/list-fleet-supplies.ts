import type { SuppliesRepository } from "../../domain/repositories/supplies-repository";
import type { FleetSupplyRow } from "../../domain/entities/supply-row";
import type { FleetSuppliesParams } from "../dtos/supplies-dtos";
import { buildFleetRows } from "./build-fleet-rows";

function applyFleetFilters(rows: FleetSupplyRow[], params: FleetSuppliesParams): FleetSupplyRow[] {
  let out = rows;
  if (params.kind) out = out.filter((r) => r.kind === params.kind);
  if (params.maxPercentage != null) out = out.filter((r) => r.percentage != null && r.percentage <= params.maxPercentage!);
  if (params.maxDays != null) out = out.filter((r) => r.remainingDays != null && r.remainingDays <= params.maxDays!);
  if (params.urgency) out = out.filter((r) => r.urgency === params.urgency);
  if (params.query) {
    const q = params.query.trim().toLowerCase();
    out = out.filter((r) =>
      (r.code ?? '').toLowerCase().includes(q) || (r.device_serial ?? '').toLowerCase().includes(q) ||
      (r.device_model ?? '').toLowerCase().includes(q) || (r.client_name ?? '').toLowerCase().includes(q)
    );
  }
  return out;
}

export class ListFleetSuppliesUseCase {
  constructor(private readonly repo: SuppliesRepository) {}

  async execute(params: FleetSuppliesParams): Promise<{ items: FleetSupplyRow[]; total: number }> {
    const rows = applyFleetFilters(await buildFleetRows(this.repo, params), params);
    // Más urgente primero — sin dato de restantes al final, no arriba (no es "urgente", es "desconocido").
    rows.sort((a, b) => (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity));

    const total = rows.length;
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = Math.max(params.offset ?? 0, 0);
    return { items: rows.slice(offset, offset + limit), total };
  }
}
