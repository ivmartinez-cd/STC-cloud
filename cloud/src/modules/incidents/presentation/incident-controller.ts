import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { getScope } from "../../../api/utils/scope";
import { IncidentError } from "../domain/errors/incident-error";
import { KnexIncidentRepository } from "../infrastructure/database/knex-incident-repository";
import { ListIncidentsUseCase, GetIncidentStatsUseCase, GetIncidentUseCase } from "../application/use-cases/incident-read-use-cases";
import {
  CreateIncidentUseCase, UpdateIncidentUseCase, SetIncidentStatusUseCase, CloseIncidentUseCase, ReopenIncidentUseCase,
} from "../application/use-cases/incident-lifecycle-use-cases";
import {
  AddIncidentCommentUseCase, AssignIncidentUseCase, LinkIncidentAlertUseCase, UnlinkIncidentAlertUseCase,
} from "../application/use-cases/incident-collaboration-use-cases";
import {
  ListIncidentRulesUseCase, UpsertIncidentRuleUseCase, ListGlobalIncidentRulesUseCase, UpsertGlobalIncidentRuleUseCase,
} from "../application/use-cases/incident-rules-use-cases";
import type { IncidentStatus } from "../domain/entities/incident-status";
import type { IncidentRulePatch } from "../domain/repositories/incident-repository";

function currentUser(request: FastifyRequest): PortalUser | undefined {
  return (request as FastifyRequest & { user?: PortalUser }).user;
}

/** Fase 11 del gap analysis vs HP SDS — controlador de incidentes. Migrado a
 * módulo con capas completas en la tanda 2026-08-27. */
export function createIncidentController(db: Knex) {
  const repo = new KnexIncidentRepository(db);
  const listIncidents = new ListIncidentsUseCase(repo);
  const getIncidentStats = new GetIncidentStatsUseCase(repo);
  const getIncident = new GetIncidentUseCase(repo);
  const createIncident = new CreateIncidentUseCase(repo);
  const updateIncident = new UpdateIncidentUseCase(repo);
  const setIncidentStatus = new SetIncidentStatusUseCase(repo);
  const closeIncident = new CloseIncidentUseCase(repo);
  const reopenIncident = new ReopenIncidentUseCase(repo);
  const addComment = new AddIncidentCommentUseCase(repo);
  const assignIncident = new AssignIncidentUseCase(repo);
  const linkAlert = new LinkIncidentAlertUseCase(repo);
  const unlinkAlert = new UnlinkIncidentAlertUseCase(repo);
  const listIncidentRules = new ListIncidentRulesUseCase(repo);
  const upsertIncidentRule = new UpsertIncidentRuleUseCase(repo);
  const listGlobalIncidentRules = new ListGlobalIncidentRulesUseCase(repo);
  const upsertGlobalIncidentRule = new UpsertGlobalIncidentRuleUseCase(repo);

  return {
    listIncidents: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const q = request.query as {
        client_id?: string; status?: string; class?: string; severity?: string;
        device_id?: string; assigned_to?: string; q?: string; limit?: string; offset?: string;
        order?: "opened_at_desc" | "opened_at_asc" | "aging_desc";
        no_device?: string; min_age_hours?: string;
      };
      const clientId = scope.kind === "client" ? scope.id : (q.client_id || null);
      return listIncidents.execute({
        clientId, status: q.status, klass: q.class, severity: q.severity,
        deviceId: q.device_id, assignedTo: q.assigned_to, q: q.q,
        noDevice: q.no_device === "true", minAgeHours: q.min_age_hours ? Number(q.min_age_hours) : undefined,
        limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
        order: q.order,
      });
    },

    getIncidentStats: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const { client_id } = request.query as { client_id?: string };
      const clientId = scope.kind === "client" ? scope.id : (client_id || null);
      return getIncidentStats.execute({ clientId });
    },

    getIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const item = await getIncident.execute(id);
      if (!item) return reply.status(404).send({ error: "Incidente no encontrado" });
      return item;
    },

    createIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const scope = getScope(request);
      const body = request.body as {
        client_id?: string; device_id?: string | null; class?: string; title?: string;
        description?: string; severity?: "warning" | "critical"; external_id?: string;
        alert_ids?: number[];
      };
      if (!body.class) return reply.status(400).send({ error: "class es requerido" });
      const clientId = scope.kind === "client" ? scope.id : body.client_id;
      if (!clientId) return reply.status(400).send({ error: "client_id es requerido" });

      const user = currentUser(request);
      try {
        const row = await createIncident.execute({
          clientId, deviceId: body.device_id ?? null, klass: body.class,
          title: body.title, description: body.description, severity: body.severity,
          externalId: body.external_id, alertIds: body.alert_ids, actorId: user?.userId ?? null,
        });
        return reply.status(201).send(row);
      } catch (err) {
        if (err instanceof IncidentError) return reply.status(err.statusCode).send({ error: err.message });
        throw err;
      }
    },

    updateIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = currentUser(request);
      try {
        const row = await updateIncident.execute(id, request.body as Record<string, unknown>, user?.userId ?? null);
        if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
        return row;
      } catch (err) {
        if (err instanceof IncidentError) return reply.status(err.statusCode).send({ error: err.message });
        throw err;
      }
    },

    setIncidentStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status?: string };
      if (!status) return reply.status(400).send({ error: "status es requerido" });
      const user = currentUser(request);
      try {
        const row = await setIncidentStatus.execute(id, status as IncidentStatus, user?.userId ?? null);
        if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
        return row;
      } catch (err) {
        if (err instanceof IncidentError) return reply.status(err.statusCode).send({ error: err.message });
        throw err;
      }
    },

    closeIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };
      const user = currentUser(request);
      const row = await closeIncident.execute(id, { reason, actorId: user?.userId ?? null });
      if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
      return row;
    },

    reopenIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };
      const user = currentUser(request);
      try {
        const row = await reopenIncident.execute(id, { reason, actorId: user?.userId ?? null });
        if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
        return row;
      } catch (err) {
        if (err instanceof IncidentError) {
          return reply.status(err.statusCode).send({ error: err.message, ...(err.conflictId ? { conflictId: err.conflictId } : {}) });
        }
        throw err;
      }
    },

    addComment: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { body } = request.body as { body?: string };
      if (!body || !body.trim()) return reply.status(400).send({ error: "body es requerido" });
      const user = currentUser(request);
      const result = await addComment.execute(id, { body: body.trim(), actorId: user?.userId ?? null });
      if (result === null) return reply.status(404).send({ error: "Incidente no encontrado" });
      return { ok: true };
    },

    assignIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { user_id } = request.body as { user_id?: string | null };
      const user = currentUser(request);
      const row = await assignIncident.execute(id, { userId: user_id ?? null, actorId: user?.userId ?? null });
      if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
      return row;
    },

    linkAlert: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { alert_id } = request.body as { alert_id?: number };
      if (!alert_id) return reply.status(400).send({ error: "alert_id es requerido" });
      const user = currentUser(request);
      try {
        const ok = await linkAlert.execute(id, alert_id, user?.userId ?? null);
        if (!ok) return reply.status(404).send({ error: "Incidente no encontrado" });
        return { ok: true };
      } catch (err) {
        if (err instanceof IncidentError) return reply.status(err.statusCode).send({ error: err.message });
        throw err;
      }
    },

    unlinkAlert: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, alertId } = request.params as { id: string; alertId: string };
      const user = currentUser(request);
      const ok = await unlinkAlert.execute(id, Number(alertId), user?.userId ?? null);
      if (!ok) return reply.status(404).send({ error: "Vínculo no encontrado" });
      return { ok: true };
    },

    listIncidentRules: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return listIncidentRules.execute(id);
    },

    // Reglas GLOBALES (client_id NULL) — Configuración del sistema, sólo
    // admin (mismo criterio que `system-settings-routes.ts::buildUpdate`:
    // un ajuste que afecta a TODA la red no es cosa de operator).
    listGlobalIncidentRules: async () => listGlobalIncidentRules.execute(),

    putGlobalIncidentRules: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = currentUser(request);
      if (user?.role !== "admin") return reply.status(403).send({ error: "Se requiere rol admin para modificar reglas globales" });
      const body = request.body as { rules?: Array<{ class: string } & IncidentRulePatch> };
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return reply.status(400).send({ error: "rules es requerido" });
      }
      const results = [];
      for (const r of body.rules) {
        if (!r.class) continue;
        results.push(await upsertGlobalIncidentRule.execute(r.class, r));
      }
      return results;
    },

    putIncidentRules: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { rules?: Array<{ class: string } & IncidentRulePatch> };
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return reply.status(400).send({ error: "rules es requerido" });
      }
      const results = [];
      for (const r of body.rules) {
        if (!r.class) continue;
        results.push(await upsertIncidentRule.execute(id, r.class, r));
      }
      return results;
    },
  };
}
