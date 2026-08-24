import type { FastifyRequest } from "fastify";
import type { ListAuditActionsUseCase } from "../application/use-cases/list-audit-actions";
import type { ListAuditLogsUseCase } from "../application/use-cases/list-audit-logs";
import { toAuditActionsView, toAuditLogsView } from "./audit-view";

interface AuditLogsQuery {
  from?: string;
  to?: string;
  action?: string;
  category?: string;
  client_id?: string;
  target_id?: string;
  user_id?: string;
  limit?: string;
  offset?: string;
}

interface AuditUseCases {
  listLogs: ListAuditLogsUseCase;
  listActions: ListAuditActionsUseCase;
}

function buildGetAuditLogsHandler(useCase: ListAuditLogsUseCase) {
  return async (request: FastifyRequest) => {
    const { from, to, action, category, client_id, target_id, user_id, limit, offset } =
      request.query as AuditLogsQuery;

    const result = await useCase.execute({
      from, to, action, category,
      clientId: client_id, targetId: target_id, userId: user_id,
      limit, offset,
    });

    return toAuditLogsView(result);
  };
}

function buildGetAuditActionsHandler(useCase: ListAuditActionsUseCase) {
  return async () => toAuditActionsView(await useCase.execute());
}

export function createAuditController(useCases: AuditUseCases) {
  return {
    getAuditLogs: buildGetAuditLogsHandler(useCases.listLogs),
    getAuditActions: buildGetAuditActionsHandler(useCases.listActions),
  };
}
