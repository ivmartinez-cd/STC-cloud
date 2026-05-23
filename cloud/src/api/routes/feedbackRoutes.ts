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
}
