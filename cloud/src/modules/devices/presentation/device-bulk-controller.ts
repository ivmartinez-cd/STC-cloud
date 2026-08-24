import type { FastifyReply, FastifyRequest } from "fastify";
import { getScope } from "../../../api/utils/scope";
import type { BulkDecommissionUseCase, BulkMoveUseCase, BulkRecommissionUseCase } from "../application/use-cases/bulk-lifecycle-use-cases";
import type { DecommissionStaleDevicesUseCase } from "../application/use-cases/decommission-stale-devices";
import type { BulkSetMonitorStateUseCase } from "../application/use-cases/monitor-state-use-cases";
import { actorOf, replyingDeviceErrors } from "./device-controller";

export interface DeviceBulkUseCases {
  bulkDecommission: BulkDecommissionUseCase;
  bulkRecommission: BulkRecommissionUseCase;
  bulkMove: BulkMoveUseCase;
  bulkMonitorState: BulkSetMonitorStateUseCase;
  decommissionStale: DecommissionStaleDevicesUseCase;
}

type Req = FastifyRequest;

/**
 * Acciones en bloque (Fase 9). Ninguna en CLIENT_VIEWER_ROUTES — deny-by-default.
 * Cada caso de uso re-scopea los `ids` (un id ajeno vuelve `skipped`, nunca 404
 * para toda la llamada).
 */
export function createDeviceBulkController(uc: DeviceBulkUseCases) {
  return {
    bulkDecommissionDevices: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => {
        const { ids, reason, dryRun } = request.body as { ids?: string[]; reason?: string; dryRun?: boolean };
        return uc.bulkDecommission.execute({ scope: getScope(request), ids: ids ?? [], reason: reason ?? "", dryRun, ...actorOf(request) });
      }),
    bulkRecommissionDevices: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => {
        const { ids, reason } = request.body as { ids?: string[]; reason?: string };
        return uc.bulkRecommission.execute({ scope: getScope(request), ids: ids ?? [], reason, ...actorOf(request) });
      }),
    bulkMoveDevices: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => {
        const { ids, agentId, reason, confirmClientChange } = request.body as { ids?: string[]; agentId?: string; reason?: string; confirmClientChange?: boolean };
        return uc.bulkMove.execute({ scope: getScope(request), ids: ids ?? [], agentId: agentId ?? "", reason: reason ?? "", confirmClientChange, ...actorOf(request) });
      }),
    bulkSetMonitorState: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.bulkMonitorState.execute({ scope: getScope(request), ...(request.body as object), ...actorOf(request) })),
    /** Colgado de `POST /agents/:id/...` en `portalAgentRoutes` — el `:id` es el agente. */
    decommissionStaleDevices: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => {
        const { id: agentId } = request.params as { id: string };
        const { inactiveDays, dryRun, reason } = request.body as { inactiveDays?: number; dryRun?: boolean; reason?: string };
        return uc.decommissionStale.execute({ agentId, inactiveDays, dryRun, reason, ...actorOf(request) });
      }),
  };
}
