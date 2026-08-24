import type { FastifyReply, FastifyRequest } from "fastify";
import { getClientIp } from "../../../api/utils/ip";
import { getPortalUser, getScope } from "../../../api/utils/scope";
import { AlertError } from "../domain/errors/alert-error";
import type { BulkUpdateAlertsUseCase } from "../application/use-cases/bulk-update-alerts";
import type { GetAlertSummaryUseCase } from "../application/use-cases/get-alert-summary";
import type { ListAlertsUseCase } from "../application/use-cases/list-alerts";
import type { UpdateAlertUseCase } from "../application/use-cases/update-alert";
import { toAlertClassesView, toAlertLifecycleView, toAlertListView, toAlertSummaryView } from "./alert-view";

interface ListAlertsQuery {
  resolved?: string; device_id?: string; client_id?: string; severity?: string; type?: string;
  alert_class?: string; responder?: string; acknowledged?: string; limit?: string; offset?: string;
}

interface LifecycleBody { acknowledged?: boolean; resolved?: boolean }

export interface AlertUseCases {
  list: ListAlertsUseCase;
  summary: GetAlertSummaryUseCase;
  update: UpdateAlertUseCase;
  bulkUpdate: BulkUpdateAlertsUseCase;
}

/** `AlertError` lleva su status; cualquier otra cosa sigue siendo un 500 de Fastify. */
async function replyingAlertErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AlertError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

function buildGetAlertsHandler(useCase: ListAlertsUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replyingAlertErrors(reply, async () => {
      const q = request.query as ListAlertsQuery;
      const items = await useCase.execute({
        scope: getScope(request), resolved: q.resolved, deviceId: q.device_id, clientId: q.client_id,
        severity: q.severity, type: q.type, alertClass: q.alert_class, responder: q.responder,
        acknowledged: q.acknowledged, limit: q.limit, offset: q.offset,
      });
      return toAlertListView(items);
    });
}

function buildGetAlertSummaryHandler(useCase: GetAlertSummaryUseCase) {
  return async (request: FastifyRequest) => {
    const { resolved, client_id } = request.query as { resolved?: string; client_id?: string };
    return toAlertSummaryView(await useCase.execute({ scope: getScope(request), clientId: client_id, resolved }));
  };
}

function buildUpdateAlertHandler(useCase: UpdateAlertUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replyingAlertErrors(reply, async () => {
      const { id } = request.params as { id: string };
      const { acknowledged, resolved } = request.body as LifecycleBody;
      const updated = await useCase.execute({
        scope: getScope(request), id, acknowledged, resolved,
        userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request),
      });
      return toAlertLifecycleView(updated);
    });
}

function buildBulkUpdateAlertsHandler(useCase: BulkUpdateAlertsUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replyingAlertErrors(reply, async () => {
      const { ids, acknowledged, resolved } = request.body as LifecycleBody & { ids?: number[] };
      return useCase.execute({
        scope: getScope(request), ids, acknowledged, resolved,
        userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request),
      });
    });
}

export function createAlertController(useCases: AlertUseCases) {
  return {
    getAlerts: buildGetAlertsHandler(useCases.list),
    getAlertClasses: async () => toAlertClassesView(),
    getAlertSummary: buildGetAlertSummaryHandler(useCases.summary),
    updateAlert: buildUpdateAlertHandler(useCases.update),
    bulkUpdateAlerts: buildBulkUpdateAlertsHandler(useCases.bulkUpdate),
  };
}
