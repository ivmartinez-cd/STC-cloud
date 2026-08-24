import type { AlertRepository } from "../../domain/repositories/alert-repository";
import type { AuditLogWriter } from "./audit-log-writer";

export interface AlertTransactionScope {
  alerts: AlertRepository;
  audit: AuditLogWriter;
}

/**
 * Unidad de trabajo para las mutaciones que deben ser atómicas con su
 * registro de auditoría (acción en bloque): o se actualizan todas las alertas
 * y queda el audit, o nada.
 */
export interface AlertUnitOfWork {
  run<T>(fn: (tx: AlertTransactionScope) => Promise<T>): Promise<T>;
}
