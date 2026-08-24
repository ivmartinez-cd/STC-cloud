/**
 * Punto de entrada del módulo `deviceLifecycleService` (Fase 2 de
 * docs/dev/ARCHITECTURE_MIGRATION_PLAN.md — dividido desde un solo archivo de
 * 516 líneas en `merge.ts` (fusión de duplicados) y `bulk.ts` (acciones en
 * bloque, Fase 9 del gap analysis)). Reexporta todo lo que el archivo
 * original exportaba; ningún import externo cambia.
 */
export { mergeDevices } from "./merge";
export {
  MergeError, MergeIdentityConflictError, MergeClientMismatchError,
  MergeTooLargeError, MergeOverlapError,
  type MergeParams, type MergeResult,
} from "./merge-types";
export {
  bulkDecommission, bulkRecommission, bulkMove, BulkActionError, MAX_BULK_DEVICE_IDS,
  type BulkSkip, type BulkResult, type BulkScope,
} from "./bulk";
