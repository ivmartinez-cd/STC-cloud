/**
 * Dominio de acciones remotas en bloque (Fase 4.6 del gap analysis vs HP
 * SDS). Puro. Las acciones son los tipos de comando que el agente 1.1.0 YA
 * ejecuta (`agent/src/core/CommandHandler.ts`).
 */

export const REMOTE_ACTIONS = ["RESCAN", "FORCE_SCAN", "RESTART", "FORCE_UPDATE"] as const;
export type RemoteAction = (typeof REMOTE_ACTIONS)[number];

export const BATCH_STATUSES = [
  "scheduled", "sent", "completed", "completed_with_errors", "cancelled",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface RemoteActionBatch {
  id: string;
  number: number;
  action: RemoteAction;
  name: string | null;
  scheduledAt: Date;
  status: BatchStatus;
  createdBy: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BatchItemState {
  agentId: string;
  agentName: string | null;
  commandId: string | null;
  /** Estado del comando subyacente: pending/sent/success/error, o null si aún no se despachó. */
  commandStatus: string | null;
}

/**
 * Estado agregado de un lote ya despachado a partir de sus comandos:
 * mientras quede alguno pending/sent el lote sigue "sent"; cuando todos
 * terminaron, es "completed" o "completed_with_errors" (semántica del SDS).
 */
export function aggregateStatus(commandStatuses: (string | null)[]): BatchStatus {
  if (commandStatuses.some((s) => s == null || s === "pending" || s === "sent")) return "sent";
  return commandStatuses.every((s) => s === "success") ? "completed" : "completed_with_errors";
}
