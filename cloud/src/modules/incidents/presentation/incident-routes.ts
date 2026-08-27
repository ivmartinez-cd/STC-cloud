import { FastifyInstance } from "fastify";
import { Knex } from "knex";
import { createIncidentController } from "./incident-controller";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";

const createIncidentSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["class"],
    properties: {
      client_id: { type: "string" },
      device_id: { type: ["string", "null"] },
      class: { type: "string", minLength: 1, maxLength: 50 },
      title: { type: "string", maxLength: 200 },
      description: { type: "string", maxLength: 5000 },
      severity: { type: "string", enum: ["warning", "critical"] },
      external_id: { type: "string", maxLength: 100 },
      alert_ids: { type: "array", maxItems: 50, items: { type: "integer" } },
    },
  },
};

const updateIncidentSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: ["string", "null"], maxLength: 5000 },
      external_id: { type: ["string", "null"], maxLength: 100 },
      class: { type: "string", minLength: 1, maxLength: 50 },
      severity: { type: "string", enum: ["warning", "critical"] },
      assigned_to: { type: ["string", "null"] },
      sla_due_at: { type: ["string", "null"] },
    },
  },
};

const statusSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: { status: { type: "string", enum: ["open", "in_progress", "on_hold"] } },
  },
};

const closeSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: { reason: { type: "string", maxLength: 1000 } },
  },
};

const reopenSchema = closeSchema;

const commentSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["body"],
    properties: { body: { type: "string", minLength: 1, maxLength: 5000 } },
  },
};

const assignSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: { user_id: { type: ["string", "null"] } },
  },
};

const linkAlertSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["alert_id"],
    properties: { alert_id: { type: "integer" } },
  },
};

const putRulesSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["rules"],
    properties: {
      rules: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["class"],
          properties: {
            class: { type: "string" },
            enabled: { type: "boolean" },
            min_severity: { type: "string", enum: ["warning", "critical"] },
            delay_minutes: { type: "integer", minimum: 0, maximum: 1440 },
            sla_hours: { type: ["integer", "null"], minimum: 1 },
            auto_close_on_alerts_resolved: { type: "boolean" },
          },
        },
      },
    },
  },
};

/**
 * Fase 11 del gap analysis vs HP SDS — módulo de incidentes. Sólo los 3 `GET`
 * de arriba (list/stats/detail) en `CLIENT_VIEWER_ROUTES` (rolePolicy.ts) —
 * gestión de servicio (crear/editar/cerrar/reabrir/comentar/asignar/vincular
 * alertas, reglas de auto-creación) queda deny-by-default.
 */
export function registerIncidentRoutes(fastify: FastifyInstance, db: Knex, portalAuth: AuthHook) {
  const ctrl = createIncidentController(db);

  fastify.get("/api/v1/incidents", { preHandler: portalAuth, handler: ctrl.listIncidents });
  fastify.get("/api/v1/incidents/stats", { preHandler: portalAuth, handler: ctrl.getIncidentStats });
  fastify.get("/api/v1/incidents/:id", { preHandler: portalAuth, handler: ctrl.getIncident });

  fastify.post("/api/v1/incidents", { preHandler: portalAuth, schema: createIncidentSchema, handler: ctrl.createIncident });
  fastify.patch("/api/v1/incidents/:id", { preHandler: portalAuth, schema: updateIncidentSchema, handler: ctrl.updateIncident });

  fastify.post("/api/v1/incidents/:id/status", { preHandler: portalAuth, schema: statusSchema, handler: ctrl.setIncidentStatus });
  fastify.post("/api/v1/incidents/:id/close", { preHandler: portalAuth, schema: closeSchema, handler: ctrl.closeIncident });
  fastify.post("/api/v1/incidents/:id/reopen", { preHandler: portalAuth, schema: reopenSchema, handler: ctrl.reopenIncident });
  fastify.post("/api/v1/incidents/:id/comments", { preHandler: portalAuth, schema: commentSchema, handler: ctrl.addComment });
  fastify.post("/api/v1/incidents/:id/assign", { preHandler: portalAuth, schema: assignSchema, handler: ctrl.assignIncident });

  fastify.post("/api/v1/incidents/:id/alerts", { preHandler: portalAuth, schema: linkAlertSchema, handler: ctrl.linkAlert });
  fastify.delete("/api/v1/incidents/:id/alerts/:alertId", { preHandler: portalAuth, handler: ctrl.unlinkAlert });

  // Reglas de auto-creación — cuelgan de /clients/:id, así que su ownership
  // ya lo resuelve `clientIdParamMatchesScope` en `authMiddleware.ts` (no
  // `incidentIdParamMatchesScope`, no aplica acá).
  fastify.get("/api/v1/clients/:id/incident-rules", { preHandler: portalAuth, handler: ctrl.listIncidentRules });
  fastify.put("/api/v1/clients/:id/incident-rules", { preHandler: portalAuth, schema: putRulesSchema, handler: ctrl.putIncidentRules });

  // Reglas GLOBALES — Configuración del sistema (handoff hifi #3, cierre de
  // gaps post-verificación, 26/08/2026). Fuera de /clients/:id a propósito:
  // client_id es NULL, no hay ownership de cliente que validar.
  fastify.get("/api/v1/settings/system/incident-rules", { preHandler: portalAuth, handler: ctrl.listGlobalIncidentRules });
  fastify.put("/api/v1/settings/system/incident-rules", { preHandler: portalAuth, schema: putRulesSchema, handler: ctrl.putGlobalIncidentRules });
}
