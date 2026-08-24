import { replacementDetected, type SupplyRequest } from "../../domain/entities/supply-request";
import type {
  SupplyRequestRepository,
  SupplyRequestWrite,
} from "../../domain/repositories/supply-request-repository";
import type {
  EnabledClientsSource,
  SupplyLevelRow,
  SupplySnapshot,
} from "../ports/supply-snapshot";
import type { RequestNotifier } from "../ports/request-notifier";

export interface DetectDeps {
  repo: SupplyRequestRepository;
  snapshot: SupplySnapshot;
  clients: EnabledClientsSource;
  notifier: RequestNotifier;
}

function toWrite(clientId: string, row: SupplyLevelRow): SupplyRequestWrite {
  return {
    clientId,
    deviceId: row.deviceId,
    deviceSerial: row.deviceSerial,
    deviceLabel: row.deviceLabel,
    supplyKey: row.supplyKey,
    supplyKind: row.supplyKind,
    supplyColor: row.supplyColor,
    description: row.description,
    sku: row.sku,
    levelPct: row.percentage,
    remainingDays: row.remainingDays,
    origin: "auto",
    notes: null,
  };
}

/** Abre pedidos para los consumibles bajo umbral. Devuelve cuántos abrió. */
export async function openDueRequests(deps: DetectDeps): Promise<number> {
  let opened = 0;
  for (const client of await deps.clients.listEnabled()) {
    const rows = await deps.snapshot.belowThreshold(client.id, client.thresholdPct);
    for (const row of rows) {
      // create() devuelve null si ya hay un pedido auto abierto (índice único parcial)
      const created = await deps.repo.create(toWrite(client.id, row), null);
      if (!created) continue;
      opened += 1;
      await deps.notifier.created(created);
    }
  }
  return opened;
}

async function completeIfReplaced(deps: DetectDeps, request: SupplyRequest): Promise<boolean> {
  const current = await deps.snapshot.currentLevel(request.deviceId!, request.supplyKey);
  if (!replacementDetected(request.levelPct, current)) return false;
  await deps.repo.setStatus(request.id, "completed", new Date());
  await deps.repo.addEvent(request.id, {
    kind: "auto_complete",
    body: `Nivel subió de ${request.levelPct ?? "?"}% a ${current}% — consumible reemplazado`,
    metadata: { from_pct: request.levelPct, to_pct: current },
  });
  await deps.notifier.completed(request);
  return true;
}

/** Cierra pedidos cuyo consumible fue reemplazado (nivel subió). Devuelve cuántos cerró. */
export async function autoCompleteReplaced(deps: DetectDeps): Promise<number> {
  let completed = 0;
  for (const request of await deps.repo.listOpenWithDevice()) {
    if (await completeIfReplaced(deps, request)) completed += 1;
  }
  return completed;
}
