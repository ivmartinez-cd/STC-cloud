import { AUTO_COMPLETE_RISE_PCT } from "../../../supply-requests";
import type { SuppliesRepository } from "../../domain/repositories/supplies-repository";
import type { SupplyHistory } from "../../domain/entities/supply-history";
import { EMPTY_RATE, type SupplyRow } from "../../domain/entities/supply-row";
import { buildSupplyRows, parseSuppliesDetails } from "../../domain/services/supply-row-builder";
import { buildCycle, detectReplacements, withRequestDeltas } from "../../domain/services/supply-history-builder";

/**
 * Detalle histórico de UN consumible — el equivalente del modal que abre el
 * SDS al tocar el porcentaje de un insumo (pedido de Ivan, 15/09/2026).
 *
 * Todo sale de datos reales: la ficha de identificación es la misma fila que
 * ya calcula `buildSupplyRows` (nada se recalcula distinto acá, para que el
 * modal y la tabla nunca discrepen), la serie es `readings_daily_agg`, y los
 * "detalles de rendimiento" se miden sobre el ciclo abierto por el último
 * reemplazo detectado. Si el consumible no tiene serie de nivel (tambores,
 * kits: no hay columna en el agregado), `points[].level` viene `null` y el
 * portal muestra el vacío explícito en vez de inventar una curva.
 *
 * `null` si el equipo no existe o si ese `supplyKey` no está entre los
 * consumibles que reporta hoy.
 */
export class GetSupplyHistoryUseCase {
  constructor(private readonly repo: SuppliesRepository) {}

  async execute(deviceId: string, supplyKey: string): Promise<SupplyHistory | null> {
    const [device, supply] = await Promise.all([
      this.repo.historyDevice(deviceId),
      this.findSupply(deviceId, supplyKey),
    ]);
    if (!device || !supply) return null;
    const [points, requests] = await Promise.all([
      this.repo.levelSeries(deviceId, supplyKey),
      this.repo.requestHistory(deviceId, supplyKey),
    ]);
    const replacements = detectReplacements(points, AUTO_COMPLETE_RISE_PCT);
    const cycle = buildCycle(points, replacements);
    return { device, supply, points, replacements, cycle, requests: withRequestDeltas(requests) };
  }

  /** La misma fila que ve la tabla — se reusa `buildSupplyRows`, nunca se recalcula distinto. */
  private async findSupply(deviceId: string, supplyKey: string): Promise<SupplyRow | null> {
    const [deviceRow, rates] = await Promise.all([
      this.repo.findDeviceById(deviceId),
      this.repo.usageRatesFor([deviceId]),
    ]);
    if (!deviceRow) return null;
    const rows = buildSupplyRows(deviceRow, parseSuppliesDetails(deviceRow.supplies_details), rates.get(deviceId) ?? EMPTY_RATE);
    return rows.find((r) => r.key === supplyKey) ?? null;
  }
}
