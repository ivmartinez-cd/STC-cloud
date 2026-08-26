import type { FastifyRequest } from "fastify";
import type { ListAuditActionsUseCase } from "../application/use-cases/list-audit-actions";
import type { ListAuditLogsUseCase } from "../application/use-cases/list-audit-logs";
import type { GetAuditSummaryUseCase } from "../application/use-cases/get-audit-summary";
import { toAuditActionsView, toAuditLogsView, toAuditSummaryView } from "./audit-view";

interface AuditLogsQuery {
  from?: string;
  to?: string;
  action?: string;
  category?: string;
  client_id?: string;
  target_id?: string;
  user_id?: string;
  exclude_user_id?: string;
  limit?: string;
  offset?: string;
}

interface AuditUseCases {
  listLogs: ListAuditLogsUseCase;
  listActions: ListAuditActionsUseCase;
  getSummary: GetAuditSummaryUseCase;
}

function queryToInput(request: FastifyRequest) {
  const { from, to, action, category, client_id, target_id, user_id, exclude_user_id, limit, offset } =
    request.query as AuditLogsQuery;
  return {
    from, to, action, category, clientId: client_id, targetId: target_id, userId: user_id,
    excludeUserId: exclude_user_id, limit, offset,
  };
}

function buildGetAuditLogsHandler(useCase: ListAuditLogsUseCase) {
  return async (request: FastifyRequest) => toAuditLogsView(await useCase.execute(queryToInput(request)));
}

function buildGetAuditActionsHandler(useCase: ListAuditActionsUseCase) {
  return async () => toAuditActionsView(await useCase.execute());
}

function buildGetAuditSummaryHandler(useCase: GetAuditSummaryUseCase) {
  return async (request: FastifyRequest) => toAuditSummaryView(await useCase.execute(queryToInput(request)));
}

export function createAuditController(useCases: AuditUseCases) {
  return {
    getAuditLogs: buildGetAuditLogsHandler(useCases.listLogs),
    getAuditActions: buildGetAuditActionsHandler(useCases.listActions),
    getAuditSummary: buildGetAuditSummaryHandler(useCases.getSummary),
  };
}
