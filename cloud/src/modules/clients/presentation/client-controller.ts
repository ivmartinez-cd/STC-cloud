import type { FastifyReply, FastifyRequest } from "fastify";
import { getClientIp } from "../../../api/utils/ip";
import { getPortalUser, getScope } from "../../../api/utils/scope";
import { DeviceRegistrationError } from "../../devices";
import { ClientError } from "../domain/errors/client-error";
import type {
  CreateApiKeyUseCase, ListApiKeysUseCase, RevokeApiKeyUseCase,
} from "../application/use-cases/client-api-key-use-cases";
import type {
  IgnorePendingDevicesUseCase, ListPendingDevicesUseCase, RegisterPendingDevicesUseCase,
} from "../application/use-cases/client-pending-device-use-cases";
import type {
  CreateClientUseCase, GetClientDevicesUseCase, GetClientMonitorsUseCase, GetClientPortfolioSummaryUseCase,
  GetClientStatsUseCase, GetClientUsageUseCase, GetClientUseCase, ListClientDeviceDirectoryUseCase,
  ListClientDirectoryUseCase, ListClientsUseCase, UpdateClientUseCase,
} from "../application/use-cases/client-use-cases";
import type { GetWebhookUseCase, PutWebhookUseCase } from "../application/use-cases/client-webhook-use-cases";

export interface ClientUseCases {
  create: CreateClientUseCase; update: UpdateClientUseCase; list: ListClientsUseCase; get: GetClientUseCase;
  monitors: GetClientMonitorsUseCase; usage: GetClientUsageUseCase; devices: GetClientDevicesUseCase;
  directory: ListClientDirectoryUseCase; portfolioSummary: GetClientPortfolioSummaryUseCase;
  stats: GetClientStatsUseCase; deviceDirectory: ListClientDeviceDirectoryUseCase;
  listApiKeys: ListApiKeysUseCase; createApiKey: CreateApiKeyUseCase; revokeApiKey: RevokeApiKeyUseCase;
  getWebhook: GetWebhookUseCase; putWebhook: PutWebhookUseCase;
  listPending: ListPendingDevicesUseCase; registerPending: RegisterPendingDevicesUseCase; ignorePending: IgnorePendingDevicesUseCase;
}

type Params = { id: string; keyId: string };
const idOf = (request: FastifyRequest) => (request.params as Params).id;
const actorOf = (request: FastifyRequest) => ({ userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request) });

/** Errores tipados con status (`ClientError`, `DeviceRegistrationError`); cualquier otro sigue siendo 500. */
async function replyingClientErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ClientError || err instanceof DeviceRegistrationError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    throw err;
  }
}

function crudHandlers(uc: ClientUseCases) {
  return {
    createClient: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => uc.create.execute({ body: request.body as any, ...actorOf(request) })),
    updateClient: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => uc.update.execute({ id: idOf(request), body: request.body as any, ...actorOf(request) })),
    listClients: (request: FastifyRequest) => uc.list.execute({ scope: getScope(request) }),
    getClient: (request: FastifyRequest) => uc.get.execute(idOf(request)),
    getClientMonitors: (request: FastifyRequest) => uc.monitors.execute({ clientId: idOf(request), scope: getScope(request) }),
    getClientUsage: (request: FastifyRequest) => uc.usage.execute(idOf(request)),
    getClientDevices: (request: FastifyRequest) =>
      uc.devices.execute({ clientId: idOf(request), include: (request.query as { include?: string }).include }),
  };
}

/** Listado hifi de "Clientes" (handoff 25/08/2026): paginado/filtrado/ordenado
 * + tira de métricas, aparte de `crudHandlers` (mismo criterio de agrupación
 * que `integrationHandlers`/`pendingDeviceHandlers` de abajo). */
type DirectoryQuery = { q?: string; segment?: string; sort?: string; dir?: string; limit?: string; offset?: string };

function listClientDirectory(uc: ClientUseCases, request: FastifyRequest) {
  const q = request.query as DirectoryQuery;
  return uc.directory.execute({
    scope: getScope(request), q: q.q, segment: q.segment, sortField: q.sort, sortDir: q.dir,
    limit: q.limit !== undefined ? Number(q.limit) : undefined,
    offset: q.offset !== undefined ? Number(q.offset) : undefined,
  });
}

function listClientDeviceDirectory(uc: ClientUseCases, request: FastifyRequest) {
  const q = request.query as DirectoryQuery;
  return uc.deviceDirectory.execute({
    clientId: idOf(request), q: q.q, segment: q.segment, sortField: q.sort, sortDir: q.dir,
    limit: q.limit !== undefined ? Number(q.limit) : undefined,
    offset: q.offset !== undefined ? Number(q.offset) : undefined,
  });
}

function directoryHandlers(uc: ClientUseCases) {
  return {
    listClientDirectory: (request: FastifyRequest) => listClientDirectory(uc, request),
    getClientPortfolioSummary: (request: FastifyRequest) => uc.portfolioSummary.execute({ scope: getScope(request) }),
    getClientStats: (request: FastifyRequest) => uc.stats.execute(idOf(request)),
    listClientDeviceDirectory: (request: FastifyRequest) => listClientDeviceDirectory(uc, request),
  };
}

function integrationHandlers(uc: ClientUseCases) {
  return {
    listApiKeys: (request: FastifyRequest) => uc.listApiKeys.execute(idOf(request)),
    createApiKey: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, async () => {
        const created = await uc.createApiKey.execute({ clientId: idOf(request), name: (request.body as { name?: string }).name });
        return reply.status(201).send(created);
      }),
    revokeApiKey: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => uc.revokeApiKey.execute({ clientId: idOf(request), keyId: (request.params as Params).keyId })),
    getWebhook: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => uc.getWebhook.execute(idOf(request))),
    putWebhook: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => {
        const b = request.body as { url?: string; events?: string[]; active?: boolean; regenerate_secret?: boolean };
        return uc.putWebhook.execute({ clientId: idOf(request), url: b.url, events: b.events, active: b.active, regenerateSecret: b.regenerate_secret });
      }),
  };
}

function pendingDeviceHandlers(uc: ClientUseCases) {
  return {
    listPendingDevices: (request: FastifyRequest) => {
      const q = request.query as { limit?: string; offset?: string; q?: string; agent_id?: string };
      return uc.listPending.execute({ clientId: idOf(request), limit: q.limit, offset: q.offset, q: q.q, agentId: q.agent_id });
    },
    registerPendingDevices: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => {
        const { deviceIds } = request.body as { deviceIds?: string[] };
        return uc.registerPending.execute({ clientId: idOf(request), deviceIds, ...actorOf(request) });
      }),
    ignorePendingDevices: (request: FastifyRequest, reply: FastifyReply) =>
      replyingClientErrors(reply, () => {
        const { deviceIds, reason } = request.body as { deviceIds?: string[]; reason?: string };
        return uc.ignorePending.execute({ clientId: idOf(request), deviceIds, reason, ...actorOf(request) });
      }),
  };
}

export function createClientController(useCases: ClientUseCases) {
  return {
    ...crudHandlers(useCases), ...directoryHandlers(useCases),
    ...integrationHandlers(useCases), ...pendingDeviceHandlers(useCases),
  };
}
