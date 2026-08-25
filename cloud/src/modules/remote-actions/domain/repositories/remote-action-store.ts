import type { BatchItemState, BatchStatus, RemoteActionBatch } from "../entities/remote-action-batch";

/**
 * Puerto de persistencia que necesita el procesamiento de lotes (despacho y
 * reconciliación). Es el subconjunto de `KnexRemoteActionRepository` que usan los
 * casos de uso: así `application/` no depende de `infrastructure/` (guía §2) y el
 * worker puede testearse con un store en memoria.
 */
export interface RemoteActionStore {
  itemsOf(batchId: string): Promise<(BatchItemState & { id: string })[]>;
  listDue(now: Date): Promise<RemoteActionBatch[]>;
  listSent(): Promise<RemoteActionBatch[]>;
  setItemCommand(itemId: string, commandId: string): Promise<void>;
  setStatus(id: string, status: BatchStatus, completedAt: Date | null): Promise<void>;
}
