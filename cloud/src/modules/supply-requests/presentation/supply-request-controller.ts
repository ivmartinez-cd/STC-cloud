import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { getScope } from "../../../api/utils/scope";
import type { RequestStatus } from "../domain/entities/supply-request";
import type { SupplyRequestRepository } from "../domain/repositories/supply-request-repository";
import type { RequestNotifier } from "../application/ports/request-notifier";
import { toEventViewDto, toViewDto } from "../application/dtos/supply-request-dtos";
import {
  addComment,
  changeStatus,
  createManualRequest,
  SupplyRequestError,
} from "../application/use-cases/manage-supply-request";

interface Deps {
  db: Knex;
  repo: SupplyRequestRepository;
  notifier: RequestNotifier;
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
function idOf(request: FastifyRequest): string {
  return (request.params as { id: string }).id;
}

function userIdOf(request: FastifyRequest): string | null {
  const user = (request as FastifyRequest & { user?: { userId?: string } }).user;
  return user?.userId ?? null;
}

/** client_viewer siempre queda clavado a su propio cliente. */
function scopedClientId(request: FastifyRequest, requested?: string): string | undefined {
  const scope = getScope(request);
  return scope.kind === "client" ? scope.id : requested;
}

function sendDomainError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof SupplyRequestError) {
    return reply.status(err.statusCode).send({ error: err.message });
  }
  throw err;
}

function buildList(deps: Deps): Handler {
  return async (request, reply) => {
    const q = request.query as Record<string, any>;
    const { items, total } = await deps.repo.list({
      clientId: scopedClientId(request, q.client_id),
      deviceId: q.device_id,
      status: q.status as RequestStatus | undefined,
      origin: q.origin,
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
    });
    return reply.send({ items: items.map(toViewDto), total });
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Mismo criterio de ventana por defecto que `/audit-logs` y `/email-log/summary`
 * (últimos 30 días) — antes `/supply-requests/stats` no tenía ventana, así
 * que "completadas este mes" era imposible de pedir. */
function buildStats(deps: Deps): Handler {
  return async (request, reply) => {
    const q = request.query as Record<string, any>;
    const clientId = scopedClientId(request, q.client_id);
    const from = q.from ? new Date(q.from) : new Date(Date.now() - THIRTY_DAYS_MS);
    const to = q.to ? new Date(q.to) : new Date();
    const [byStatus, window] = await Promise.all([deps.repo.stats(clientId), deps.repo.statsWindow(clientId, from, to)]);
    return reply.send({ ...byStatus, window });
  };
}

function buildDetail(deps: Deps): Handler {
  return async (request, reply) => {
    const found = await deps.repo.findById(idOf(request));
    if (!found) return reply.status(404).send({ error: "Pedido no encontrado" });
    const events = await deps.repo.eventsOf(found.id);
    return reply.send({ ...toViewDto(found), events: events.map(toEventViewDto) });
  };
}

async function deviceSnapshotOf(db: Knex, deviceId: string | null) {
  if (!deviceId) return { serial: null as string | null, label: null as string | null };
  const device = await db("devices").where({ id: deviceId }).select("serial_number", "model").first();
  return { serial: device?.serial_number ?? null, label: device?.model ?? null };
}

function buildCreate(deps: Deps): Handler {
  return async (request, reply) => {
    const b = request.body as Record<string, any>;
    const snapshot = await deviceSnapshotOf(deps.db, b.device_id ?? null);
    try {
      const created = await createManualRequest(deps, {
        clientId: b.client_id,
        deviceId: b.device_id ?? null,
        deviceSerial: snapshot.serial,
        deviceLabel: snapshot.label,
        supplyKey: b.supply_key || `manual:${b.supply_kind}:${b.supply_color ?? ""}`,
        supplyKind: b.supply_kind,
        supplyColor: b.supply_color ?? null,
        description: b.description ?? null,
        sku: b.sku ?? null,
        levelPct: null,
        remainingDays: null,
        supplySerial: null,
        externalRef: b.external_ref ?? null,
        reason: "manual",
        monoPages: null,
        colorPages: null,
        totalPages: null,
        notes: b.notes ?? null,
      }, userIdOf(request));
      return reply.status(201).send(toViewDto(created));
    } catch (err) {
      return sendDomainError(reply, err);
    }
  };
}

function buildStatusChange(deps: Deps): Handler {
  return async (request, reply) => {
    const b = request.body as { status: RequestStatus; note?: string | null };
    try {
      const updated = await changeStatus(deps.repo, {
        id: idOf(request), to: b.status, note: b.note, userId: userIdOf(request),
      });
      return reply.send(toViewDto(updated));
    } catch (err) {
      return sendDomainError(reply, err);
    }
  };
}

function buildComment(deps: Deps): Handler {
  return async (request, reply) => {
    const b = request.body as { body: string };
    try {
      await addComment(deps.repo, { id: idOf(request), body: b.body, userId: userIdOf(request) });
      return reply.status(201).send({ ok: true });
    } catch (err) {
      return sendDomainError(reply, err);
    }
  };
}

function buildGetSettings(deps: Deps): Handler {
  return async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await deps.db("clients").where({ id })
      .select("supply_requests_enabled", "supply_request_threshold_pct").first();
    if (!client) return reply.status(404).send({ error: "Cliente no encontrado" });
    return reply.send({
      enabled: client.supply_requests_enabled,
      threshold_pct: client.supply_request_threshold_pct,
    });
  };
}

function buildPutSettings(deps: Deps): Handler {
  return async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = request.body as { enabled: boolean; threshold_pct: number };
    const count = await deps.db("clients").where({ id }).update({
      supply_requests_enabled: b.enabled,
      supply_request_threshold_pct: b.threshold_pct,
    });
    if (!count) return reply.status(404).send({ error: "Cliente no encontrado" });
    return reply.send({ enabled: b.enabled, threshold_pct: b.threshold_pct });
  };
}

export function createSupplyRequestController(deps: Deps) {
  return {
    list: buildList(deps),
    stats: buildStats(deps),
    detail: buildDetail(deps),
    create: buildCreate(deps),
    statusChange: buildStatusChange(deps),
    comment: buildComment(deps),
    getSettings: buildGetSettings(deps),
    putSettings: buildPutSettings(deps),
  };
}
