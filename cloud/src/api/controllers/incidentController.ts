import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getScope } from "../utils/scope";
import * as incidentService from "../../services/incidentService";
import { IncidentError } from "../../services/incidentService";

function currentUser(request: FastifyRequest): PortalUser | undefined {
  return (request as FastifyRequest & { user?: PortalUser }).user;
}

/** Fase 11 del gap analysis vs HP SDS — controlador de incidentes. */
export function createIncidentController(db: Knex) {
  return {
    listIncidents: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const q = request.query as {
        client_id?: string; status?: string; class?: string; severity?: string;
        device_id?: string; assigned_to?: string; q?: string; limit?: string; offset?: string;
        order?: "opened_at_desc" | "opened_at_asc" | "aging_desc";
      };
      const clientId = scope.kind === "client" ? scope.id : (q.client_id || null);
      return incidentService.listIncidents(db, {
        clientId, status: q.status, klass: q.class, severity: q.severity,
        deviceId: q.device_id, assignedTo: q.assigned_to, q: q.q,
        limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
        order: q.order,
      });
    },

    getIncidentStats: async (request: FastifyRequest) => {
      const scope = getScope(request);
      const { client_id } = request.query as { client_id?: string };
      const clientId = scope.kind === "client" ? scope.id : (client_id || null);
      return incidentService.getIncidentStats(db, { clientId });
    },

    getIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const item = await incidentService.getIncident(db, id);
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
        const row = await incidentService.createIncident(db, {
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
        const row = await incidentService.updateIncident(db, id, request.body as Record<string, unknown>, user?.userId ?? null);
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
        const row = await incidentService.setStatus(db, id, status as any, user?.userId ?? null);
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
      const row = await incidentService.closeIncident(db, id, { reason, actorId: user?.userId ?? null });
      if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
      return row;
    },

    reopenIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };
      const user = currentUser(request);
      try {
        const row = await incidentService.reopenIncident(db, id, { reason, actorId: user?.userId ?? null });
        if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
        return row;
      } catch (err) {
        if (err instanceof IncidentError) {
          const conflictId = (err as IncidentError & { conflictId?: string }).conflictId;
          return reply.status(err.statusCode).send({ error: err.message, ...(conflictId ? { conflictId } : {}) });
        }
        throw err;
      }
    },

    addComment: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { body } = request.body as { body?: string };
      if (!body || !body.trim()) return reply.status(400).send({ error: "body es requerido" });
      const user = currentUser(request);
      const result = await incidentService.addComment(db, id, { body: body.trim(), actorId: user?.userId ?? null });
      if (result === null) return reply.status(404).send({ error: "Incidente no encontrado" });
      return { ok: true };
    },

    assignIncident: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { user_id } = request.body as { user_id?: string | null };
      const user = currentUser(request);
      const row = await incidentService.assignIncident(db, id, { userId: user_id ?? null, actorId: user?.userId ?? null });
      if (!row) return reply.status(404).send({ error: "Incidente no encontrado" });
      return row;
    },

    linkAlert: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { alert_id } = request.body as { alert_id?: number };
      if (!alert_id) return reply.status(400).send({ error: "alert_id es requerido" });
      const user = currentUser(request);
      try {
        const ok = await incidentService.linkAlert(db, id, alert_id, user?.userId ?? null);
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
      const ok = await incidentService.unlinkAlert(db, id, Number(alertId), user?.userId ?? null);
      if (!ok) return reply.status(404).send({ error: "Vínculo no encontrado" });
      return { ok: true };
    },

    listIncidentRules: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return incidentService.listIncidentRules(db, id);
    },

    putIncidentRules: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { rules?: Array<{ class: string; enabled?: boolean; min_severity?: string; delay_minutes?: number; sla_hours?: number | null; auto_close_on_alerts_resolved?: boolean }> };
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return reply.status(400).send({ error: "rules es requerido" });
      }
      const results = [];
      for (const r of body.rules) {
        if (!r.class) continue;
        results.push(await incidentService.upsertIncidentRule(db, id, r.class, r));
      }
      return results;
    },
  };
}
