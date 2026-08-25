import { aggregateStatus, type RemoteActionBatch } from "../../domain/entities/remote-action-batch";
import type { RemoteActionStore } from "../../domain/repositories/remote-action-store";

/** Puerto mínimo sobre la cola de comandos existente (AgentCommandService). */
export interface CommandEnqueuer {
  addCommand(agentId: string, type: string, payload: Record<string, unknown>, createdBy?: string):
    Promise<{ id: string }>;
}

async function dispatchBatch(
  repo: RemoteActionStore,
  commands: CommandEnqueuer,
  batch: RemoteActionBatch
): Promise<void> {
  for (const item of await repo.itemsOf(batch.id)) {
    if (item.commandId) continue; // re-entrada tras un fallo parcial: no duplicar
    // RESTART_PRINTER necesita la IP del equipo puntual dentro de la flota
    // del agente (CommandHandler.ts, caso RESTART_PRINTER); las acciones de
    // agente no llevan payload propio.
    const payload: Record<string, unknown> = { batch_id: batch.id };
    if (item.deviceIp) payload.ip = item.deviceIp;
    const command = await commands.addCommand(item.agentId, batch.action, payload, batch.createdBy ?? undefined);
    await repo.setItemCommand(item.id, command.id);
  }
  await repo.setStatus(batch.id, "sent", null);
}

/** Despacha lotes programados vencidos → crea los `agent_commands`. */
export async function dispatchDueBatches(
  repo: RemoteActionStore,
  commands: CommandEnqueuer,
  now: Date
): Promise<number> {
  const due = await repo.listDue(now);
  for (const batch of due) await dispatchBatch(repo, commands, batch);
  return due.length;
}

/** Reconcilia lotes enviados: cuando todos sus comandos terminaron, cierra el lote. */
export async function reconcileSentBatches(repo: RemoteActionStore): Promise<number> {
  let closed = 0;
  for (const batch of await repo.listSent()) {
    const items = await repo.itemsOf(batch.id);
    const status = aggregateStatus(items.map((i) => i.commandStatus));
    if (status === "sent") continue;
    await repo.setStatus(batch.id, status, new Date());
    closed += 1;
  }
  return closed;
}
