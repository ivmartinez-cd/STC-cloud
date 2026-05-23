import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Knex } from "knex";

interface FeedbackBody {
  type: "bug" | "enhancement";
  title: string;
  description: string;
  image_url?: string;
}

export function createFeedbackController(fastify: FastifyInstance, db: Knex) {
  return {
    submit: async (request: FastifyRequest) => {
      const user = (request as any).user as {
        userId: string;
        username: string;
        role: string;
      };
      const { type, title, description, image_url } = request.body as FeedbackBody;

      let actualUserId = user.userId;
      let actualUsername = user.username;

      if (user.userId === "admin") {
        const actualAdmin = await db("users").where({ username: "admin" }).first();
        if (actualAdmin) {
          actualUserId = actualAdmin.id;
          actualUsername = actualAdmin.username;
        }
      }

      const [feedback] = await db("user_feedback")
        .insert({
          id: db.raw("gen_random_uuid()"),
          user_id: actualUserId,
          type,
          title: title.trim(),
          description: description.trim(),
          image_url: image_url?.trim() || null,
          status: "open",
        })
        .returning(["id", "type", "title", "status", "created_at"]);

      // Audit log para bugs críticos o cualquier feedback
      await db("audit_logs").insert({
        id: db.raw("gen_random_uuid()"),
        user_id: actualUserId,
        action: type === "bug" ? "REPORT_BUG" : "SUGGEST_ENHANCEMENT",
        target_id: feedback.id,
        metadata: db.raw("?::jsonb", [
          JSON.stringify({ title, type, submitted_by: actualUsername }),
        ]),
        ip_address: request.ip,
      });

      fastify.log.info(
        `[Feedback] ${type.toUpperCase()} reportado por ${actualUsername}: "${title}" (id=${feedback.id})`
      );

      return { success: true, feedback };
    },

    list: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as { role: string };
      if (user.role !== "admin") {
        return reply.status(403).send({ error: "Solo administradores pueden ver los reportes" });
      }

      const feedbackList = await db("user_feedback as f")
        .join("users as u", "f.user_id", "u.id")
        .select(
          "f.id",
          "f.type",
          "f.title",
          "f.description",
          "f.image_url",
          "f.status",
          "f.created_at",
          "u.username"
        )
        .orderBy("f.created_at", "desc");

      return feedbackList;
    },

    updateStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as any).user as {
        userId: string;
        username: string;
        role: string;
      };
      if (user.role !== "admin") {
        return reply.status(403).send({ error: "Solo administradores pueden actualizar los reportes" });
      }

      const { id } = request.params as { id: string };
      const { status } = request.body as { status: "open" | "in_progress" | "closed" };

      // Reemplazamos la lógica del usuario si es el admin harcodeado
      let actualUserId = user.userId;
      let actualUsername = user.username;
      if (user.userId === "admin") {
        const actualAdmin = await db("users").where({ username: "admin" }).first();
        if (actualAdmin) {
          actualUserId = actualAdmin.id;
          actualUsername = actualAdmin.username;
        }
      }

      const [updated] = await db("user_feedback")
        .where({ id })
        .update({ status, updated_at: db.fn.now() })
        .returning(["id", "title", "status"]);

      if (!updated) {
        return reply.status(404).send({ error: "Feedback no encontrado" });
      }

      await db("audit_logs").insert({
        id: db.raw("gen_random_uuid()"),
        user_id: actualUserId,
        action: "UPDATE_FEEDBACK_STATUS",
        target_id: id,
        metadata: db.raw("?::jsonb", [
          JSON.stringify({ status, title: updated.title, updated_by: actualUsername }),
        ]),
        ip_address: request.ip,
      });

      fastify.log.info(`[Feedback] Estado de ${id} actualizado a ${status} por ${actualUsername}`);

      return { success: true, feedback: updated };
    },
  };
}
