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

/** Snapshot de lectura al abrir — sin esto el historial del modal no puede calcular los Δ. */
function snapshotOf(row: SupplyLevelRow) {
  return {
    supplySerial: row.supplySerial,
    externalRef: null,
    // Hoy el único disparador automático es el umbral de nivel; cuando exista
    // uno por días restantes, acá va `runtime` (ver `REQUEST_REASONS`).
    reason: "low_level" as const,
    monoPages: row.monoPages,
    colorPages: row.colorPages,
    totalPages: row.totalPages,
  };
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
    ...snapshotOf(row),
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
  const now = new Date();
  await deps.repo.setStatus(request.id, "completed", now);
  // Columna aparte de `closed_at`: un pedido ignorado/cancelado también cierra,
  // pero sólo acá se sabe que el cartucho efectivamente se cambió.
  await deps.repo.setReplacedAt(request.id, now);
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
