import type { FastifyReply, FastifyRequest } from "fastify";
import { getClientIp } from "../../../api/utils/ip";
import { getPortalUser, getScope } from "../../../api/utils/scope";
import { CustomFieldError } from "../../inventory";
import { DeviceError } from "../domain/errors/device-error";
import { MergeError, MergeOverlapError } from "../domain/errors/merge-error";
import type { DeleteDeviceUseCase } from "../application/use-cases/delete-device";
import type {
  GetDeviceReadingsUseCase, GetDeviceSuppliesUseCase, GetDeviceUsageHistoryUseCase, GetDeviceUseCase,
  ListDevicesUseCase, ListDuplicatesUseCase,
} from "../application/use-cases/device-read-use-cases";
import type { DecommissionDeviceUseCase, RecommissionDeviceUseCase } from "../application/use-cases/lifecycle-use-cases";
import type { MergeDeviceRequestUseCase } from "../application/use-cases/merge-devices";
import type { UpdateMonitorStateUseCase } from "../application/use-cases/monitor-state-use-cases";
import type { MoveDeviceUseCase } from "../application/use-cases/move-device";
import type { UnignoreDeviceRequestUseCase } from "../application/use-cases/registration-use-cases";
import type { UpdateDeviceUseCase } from "../application/use-cases/update-device";

export interface DeviceUseCases {
  list: ListDevicesUseCase; get: GetDeviceUseCase; readings: GetDeviceReadingsUseCase;
  supplies: GetDeviceSuppliesUseCase; usageHistory: GetDeviceUsageHistoryUseCase; duplicates: ListDuplicatesUseCase;
  update: UpdateDeviceUseCase; remove: DeleteDeviceUseCase;
  decommission: DecommissionDeviceUseCase; recommission: RecommissionDeviceUseCase; move: MoveDeviceUseCase;
  merge: MergeDeviceRequestUseCase; monitorState: UpdateMonitorStateUseCase; unignore: UnignoreDeviceRequestUseCase;
}

type Req = FastifyRequest;
const scopedId = (request: Req) => ({ id: (request.params as { id: string }).id, scope: getScope(request) });
export const actorOf = (request: Req) => ({ userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request) });

/** Errores tipados con status (`DeviceError`, `CustomFieldError`, familia Merge → 409); cualquier otro sigue siendo 500. */
export async function replyingDeviceErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DeviceError) return reply.status(err.statusCode).send({ error: err.message, ...(err.extra ?? {}) });
    if (err instanceof CustomFieldError) return reply.status(err.statusCode).send({ error: err.message });
    if (err instanceof MergeOverlapError) {
      return reply.status(409).send({ error: err.message, from: err.from, to: err.to, sourceCount: err.sourceCount, targetCount: err.targetCount });
    }
    // Incluye "no existe" — 409 es razonable igual: ambos ids ya se validaron contra el scope del llamador.
    if (err instanceof MergeError) return reply.status(409).send({ error: err.message });
    throw err;
  }
}

type ListDevicesQueryString = { include?: string; q?: string; limit?: string; offset?: string };

/** `{items, total}` — el caller ya sabe qué `limit`/`offset` pidió, mismo criterio que `listPendingDevices` en `client-controller.ts`. */
function listDevices(uc: DeviceUseCases, request: Req) {
  const { include, q, limit, offset } = request.query as ListDevicesQueryString;
  return uc.list.execute({
    scope: getScope(request), include, q,
    limit: limit !== undefined ? Number(limit) : undefined,
    offset: offset !== undefined ? Number(offset) : undefined,
  });
}

function readHandlers(uc: DeviceUseCases) {
  return {
    listDevices: (request: Req) => listDevices(uc, request),
    getDevice: (request: Req, reply: FastifyReply) => replyingDeviceErrors(reply, () => uc.get.execute(scopedId(request))),
    getDeviceReadings: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.readings.execute({ ...scopedId(request), ...(request.query as { from?: string; to?: string; limit?: string }) })),
    getDeviceSupplies: (request: Req, reply: FastifyReply) => replyingDeviceErrors(reply, () => uc.supplies.execute(scopedId(request))),
    getDeviceUsageHistory: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.usageHistory.execute({ ...scopedId(request), ...(request.query as { granularity?: string; limit?: string }) })),
    listDuplicates: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => {
        const { client_id, agent_id } = request.query as { client_id?: string; agent_id?: string };
        return uc.duplicates.execute({ scope: getScope(request), clientId: client_id, agentId: agent_id });
      }),
  };
}

function mutationHandlers(uc: DeviceUseCases) {
  return {
    updateDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.update.execute({ ...scopedId(request), ...actorOf(request), body: request.body as any })),
    // Históricamente CUALQUIER error del borrado respondía con su `status` o 404 + mensaje — se conserva.
    deleteDevice: async (request: Req, reply: FastifyReply) => {
      try {
        return await uc.remove.execute({ ...scopedId(request), ...actorOf(request) });
      } catch (e: any) {
        return reply.status(e instanceof DeviceError ? e.statusCode : 404).send({ error: e?.message ?? String(e) });
      }
    },
    decommissionDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.decommission.execute({ ...scopedId(request), ...actorOf(request), reason: (request.body as { reason?: string }).reason })),
    recommissionDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.recommission.execute({ ...scopedId(request), ...actorOf(request), reason: (request.body as { reason?: string }).reason })),
    moveDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.move.execute({ ...scopedId(request), ...actorOf(request), ...(request.body as object) })),
    mergeDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.merge.execute({ ...scopedId(request), ...actorOf(request), ...(request.body as object) })),
    updateMonitorState: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.monitorState.execute({ ...scopedId(request), ...actorOf(request), ...(request.body as object) })),
    unignoreDevice: (request: Req, reply: FastifyReply) =>
      replyingDeviceErrors(reply, () => uc.unignore.execute({ ...scopedId(request), ...actorOf(request), ...((request.body as object | undefined) ?? {}) })),
  };
}

export function createDeviceController(useCases: DeviceUseCases) {
  return { ...readHandlers(useCases), ...mutationHandlers(useCases) };
}
