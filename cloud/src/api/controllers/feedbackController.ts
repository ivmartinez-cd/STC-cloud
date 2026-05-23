import type { FastifyInstance, FastifyRequest } from "fastify";
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
  };
}
