export interface ClientOption { id: string; name: string; }
export interface AgentOption { id: string; name: string; }

/**
 * Mismo chrome que los modales individuales; la diferencia es que las
 * acciones en bloque operan sobre una lista de ids y el resultado siempre
 * trae `{count, applied, skipped}` — `onDone` se lo pasa al caller para que
 * muestre cuántos aplicaron y cuántos no (nunca un éxito silencioso si algo
 * quedó afuera).
 */
export interface BulkActionResult { count: number; applied: string[]; skipped: Array<{ id: string; reason: string }> }
