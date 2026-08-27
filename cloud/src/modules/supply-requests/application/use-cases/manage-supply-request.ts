import {
  canTransition,
  type RequestStatus,
  type SupplyRequest,
} from "../../domain/entities/supply-request";
import type {
  SupplyRequestRepository,
  SupplyRequestWrite,
} from "../../domain/repositories/supply-request-repository";
import type { RequestNotifier } from "../ports/request-notifier";
import { AppError } from "../../../../shared/domain/errors";

export class SupplyRequestError extends AppError {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

const CLOSED_AT: Record<RequestStatus, boolean> = {
  pending: false, reviewed: false, processed: false,
  completed: true, ignored: true, cancelled: true,
};

export async function createManualRequest(
  deps: { repo: SupplyRequestRepository; notifier: RequestNotifier },
  data: Omit<SupplyRequestWrite, "origin">,
  createdBy: string | null
): Promise<SupplyRequest> {
  const created = await deps.repo.create({ ...data, origin: "manual" }, createdBy);
  if (!created) {
    // el índice parcial solo aplica a origin='auto'; un choque acá es inesperado
    throw new SupplyRequestError("No se pudo crear el pedido", 500);
  }
  await deps.repo.addEvent(created.id, {
    kind: "status_change",
    body: "Pedido creado (pendiente)",
    userId: createdBy,
  });
  await deps.notifier.created(created);
  return created;
}

export async function changeStatus(
  repo: SupplyRequestRepository,
  params: { id: string; to: RequestStatus; note?: string | null; userId: string | null }
): Promise<SupplyRequest> {
  const request = await repo.findById(params.id);
  if (!request) throw new SupplyRequestError("Pedido no encontrado", 404);
  if (!canTransition(request.status, params.to)) {
    throw new SupplyRequestError(`Transición inválida: ${request.status} → ${params.to}`, 409);
  }
  await repo.setStatus(params.id, params.to, CLOSED_AT[params.to] ? new Date() : null);
  await repo.addEvent(params.id, {
    kind: "status_change",
    body: params.note ?? `Estado: ${request.status} → ${params.to}`,
    metadata: { from: request.status, to: params.to },
    userId: params.userId,
  });
  return (await repo.findById(params.id))!;
}

export async function addComment(
  repo: SupplyRequestRepository,
  params: { id: string; body: string; userId: string | null }
): Promise<void> {
  const request = await repo.findById(params.id);
  if (!request) throw new SupplyRequestError("Pedido no encontrado", 404);
  await repo.addEvent(params.id, { kind: "comment", body: params.body, userId: params.userId });
}
