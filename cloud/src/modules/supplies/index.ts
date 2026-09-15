/**
 * Fase 8 del gap analysis vs HP SDS — superficie de consumibles. Migrado de
 * `services/suppliesService/` a módulo con capas completas
 * (`ARCHITECTURE_MIGRATION_PLAN.md`, tanda 2026-08-27) — mismos nombres y
 * firmas que el service plano para que los consumidores externos
 * (`modules/supply-requests`, `modules/system-settings`, `modules/devices`,
 * `modules/scheduled-reports`) no necesiten cambiar más que el import.
 */
import { Knex } from "knex";
import { KnexSuppliesRepository } from "./infrastructure/database/knex-supplies-repository";
import { ListFleetSuppliesUseCase } from "./application/use-cases/list-fleet-supplies";
import { GetDeviceSuppliesUseCase } from "./application/use-cases/get-device-supplies";
import { GetSuppliesSummaryUseCase } from "./application/use-cases/get-supplies-summary";
import { CountSuppliesBelowThresholdUseCase } from "./application/use-cases/count-supplies-below-threshold";
import { GetSupplyHistoryUseCase } from "./application/use-cases/get-supply-history";
import type { FleetDeviceParams } from "./domain/repositories/supplies-repository";
import type { FleetSuppliesParams, SuppliesSummary } from "./application/dtos/supplies-dtos";
import type { FleetSupplyRow, SupplyRow, UsageRate } from "./domain/entities/supply-row";
import type { SupplyHistory } from "./domain/entities/supply-history";

export type {
  SuppliesItem, SupplyKind, SupplyColor, SupplyRow, FleetSupplyRow, SupplyUrgency, UsageRate,
} from "./domain/entities/supply-row";
export { parseSuppliesDetails, buildSupplyRows } from "./domain/services/supply-row-builder";
export type {
  SupplyHistory, SupplyHistoryDevice, SupplyLevelPoint, SupplyReplacement, SupplyCycle, SupplyRequestHistoryRow,
} from "./domain/entities/supply-history";
export type { FleetSuppliesParams, SuppliesSummary } from "./application/dtos/supplies-dtos";
export { registerSuppliesRoutes } from "./presentation/supplies-routes";

export async function usageRatesFor(db: Knex, deviceIds: string[]): Promise<Map<string, UsageRate>> {
  return new KnexSuppliesRepository(db).usageRatesFor(deviceIds);
}

export async function deviceSupplies(db: Knex, deviceId: string): Promise<{ rate: UsageRate; rows: SupplyRow[] } | null> {
  return new GetDeviceSuppliesUseCase(new KnexSuppliesRepository(db)).execute(deviceId);
}

export async function fleetSupplies(db: Knex, params: FleetSuppliesParams): Promise<{ items: FleetSupplyRow[]; total: number }> {
  return new ListFleetSuppliesUseCase(new KnexSuppliesRepository(db)).execute(params);
}

export async function suppliesSummary(db: Knex, params: FleetDeviceParams): Promise<SuppliesSummary> {
  return new GetSuppliesSummaryUseCase(new KnexSuppliesRepository(db)).execute(params);
}

export async function suppliesCountBelowThreshold(db: Knex, pct: number): Promise<number> {
  return new CountSuppliesBelowThresholdUseCase(new KnexSuppliesRepository(db)).execute(pct);
}

/** Detalle histórico de un consumible puntual (modal "Detalles del consumible"). */
export async function supplyHistory(db: Knex, deviceId: string, supplyKey: string): Promise<SupplyHistory | null> {
  return new GetSupplyHistoryUseCase(new KnexSuppliesRepository(db)).execute(deviceId, supplyKey);
}
