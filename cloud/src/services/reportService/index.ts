/**
 * Punto de entrada del módulo `reportService` (Fase 2 de
 * docs/dev/ARCHITECTURE_MIGRATION_PLAN.md — dividido desde un solo archivo de
 * 355 líneas en `period-usage.ts` (cálculo de volumen del período, sin
 * escritura) y `closure.ts` (cierre/reapertura, con escritura + auditoría +
 * entrega)). Reexporta todo lo que el archivo original exportaba; ningún
 * import externo cambia.
 */
export { parsePeriod, formatPeriod, computePeriodUsage, type PeriodUsageLine } from "./period-usage";
export { closePeriod, reopenPeriod, ClosurePeriodConflictError, type CloseClosureResult } from "./closure";
