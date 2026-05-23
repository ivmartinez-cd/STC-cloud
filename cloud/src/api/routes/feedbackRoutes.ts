import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { createFeedbackController } from "../controllers/feedbackController";

const submitFeedbackSchema = {
  body: {
    type: "object",
    required: ["type", "title", "description"],
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["bug", "enhancement"] },
      title: { type: "string", minLength: 3, maxLength: 200 },
      description: { type: "string", minLength: 10, maxLength: 5000 },
      image_url: { type: "string", maxLength: 500 },
    },
  },
};

const updateStatusSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
  body: {
    type: "object",
    required: ["status"],
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["open", "in_progress", "closed"] },
    },
  },
};

export function registerFeedbackRoutes(
  fastify: FastifyInstance,
  db: Knex,
  portalAuth: (request: any, reply: any) => Promise<void>
) {
  const ctrl = createFeedbackController(fastify, db);

  fastify.post("/api/v1/feedback", {
    preHandler: portalAuth,
    schema: submitFeedbackSchema,
    handler: ctrl.submit,
  });

  fastify.get("/api/v1/feedback", {
    preHandler: portalAuth,
    handler: ctrl.list,
  });

  fastify.put("/api/v1/feedback/:id/status", {
    preHandler: portalAuth,
    schema: updateStatusSchema,
    handler: ctrl.updateStatus,
  });
}
