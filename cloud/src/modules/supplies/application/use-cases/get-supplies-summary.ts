import type { FleetDeviceParams, SuppliesRepository } from "../../domain/repositories/supplies-repository";
import { LOW_PCT } from "../../domain/services/supply-urgency";
import type { SuppliesSummary } from "../dtos/supplies-dtos";
import { buildFleetRows } from "./build-fleet-rows";

/** Tira de 5 métricas de Consumibles (handoff hifi #3, fase 3, 26/08/2026):
 * ítems monitoreados, críticos, nivel bajo, sin lectura SNMP y pedidos
 * abiertos — todo calculado en servidor sobre la misma pasada de filas que
 * ya recorría `criticalCount`/`lowCount`, para que la tira y la tabla nunca
 * muestren números distintos. */
export class GetSuppliesSummaryUseCase {
  constructor(private readonly repo: SuppliesRepository) {}

  async execute(params: FleetDeviceParams): Promise<SuppliesSummary> {
    const [rows, openOrders] = await Promise.all([
      buildFleetRows(this.repo, params),
      this.repo.countOpenSupplyRequests(params),
    ]);
    const criticalCount = rows.filter((r) => r.urgency === "critico").length;
    const lowCount = rows.filter((r) => r.urgency === "bajo").length;
    const noReadingCount = rows.filter((r) => r.urgency === "sin_lectura").length;
    const top = [...rows]
      .filter((r) => r.percentage != null && r.percentage <= LOW_PCT)
      .sort((a, b) => (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity))
      .slice(0, 5);
    return { total: rows.length, criticalCount, lowCount, noReadingCount, openOrders, top };
  }
}
