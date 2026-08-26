/**
 * Fase 8 del gap analysis vs HP SDS — superficie de consumibles. El detalle
 * de insumos por equipo ya era más rico que HP SDS (`devices.supplies_details`
 * jsonb con SKU, serial de cartucho, páginas restantes), pero vivía SÓLO en
 * `DeviceDetail.tsx` (cálculo client-side sobre `GET /devices/:id/readings`,
 * lib/supplies.ts) — sin superficie de flota ni en el dashboard. Puerto 1:1
 * de esa lógica acá (mismos nombres/campos que `lib/supplies.ts`, que ahora
 * pasa a ser sólo formatters) para que exista UNA sola implementación del
 * cálculo, consumida tanto por `/devices/:id/supplies` como por `/supplies`
 * (flota) sin duplicar ni divergir.
 *
 * Punto de entrada del módulo (Fase 2 de docs/dev/ARCHITECTURE_MIGRATION_PLAN.md
 * — dividido desde un solo archivo de 301 líneas en `types.ts`, `row-builder.ts`
 * (lógica pura) y `queries.ts` (DB)). Reexporta todo lo que el archivo
 * original exportaba; ningún import externo cambia.
 */
export type {
  SuppliesItem, SupplyKind, SupplyColor, SupplyRow, FleetSupplyRow, SupplyUrgency, UsageRate,
} from "./types";
export { parseSuppliesDetails, buildSupplyRows } from "./row-builder";
export {
  usageRatesFor, deviceSupplies, fleetSupplies, suppliesSummary, suppliesCountBelowThreshold,
  type FleetSuppliesParams, type SuppliesSummary,
} from "./queries";
