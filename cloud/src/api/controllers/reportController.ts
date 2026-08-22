import { FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import type { PortalUser } from "../middlewares/authMiddleware";
import { getClientIp } from "../utils/ip";
import {
  ClosurePeriodConflictError,
  closePeriod,
  computePeriodUsage,
  formatPeriod,
  reopenPeriod,
} from "../../services/reportService";
import { buildClosureCsv, buildClosureXlsx } from "../../services/reportExportService";

/**
 * Todas las rutas cuelgan de `/api/v1/clients/:id/reports*` — el ownership del
 * `:id` ya lo valida el gate de RBAC (`isClientIdParamRoute` en
 * `authMiddleware.ts`/`scope.ts`) antes de llegar acá, tanto para admin/operator
 * (sin restricción) como para `client_viewer` (sólo su propio cliente). Las
 * mutaciones (`closePeriodHandler`/`reopenPeriodHandler`) no están en
 * `CLIENT_VIEWER_ROUTES` — deny-by-default alcanza para 403 automático.
 */
export function createReportController(db: Knex) {
  const currentUser = (request: FastifyRequest) => (request as FastifyRequest & { user: PortalUser }).user;

  return {
    previewPeriod: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { period } = request.query as { period?: string };
      if (!period) return reply.status(400).send({ error: "Falta el parámetro period (YYYY-MM)" });
      try {
        const lines = await computePeriodUsage(db, { clientId: id, period });
        return { period, lines };
      } catch (err: unknown) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },

    closePeriodHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { period } = request.body as { period: string };
      const user = currentUser(request);
      try {
        const closure = await closePeriod(db, {
          clientId: id,
          period,
          userId: user?.userId ?? null,
          ipAddress: getClientIp(request),
        });
        return closure;
      } catch (err: unknown) {
        if (err instanceof ClosurePeriodConflictError) {
          return reply.status(409).send({ error: err.message });
        }
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },

    listClosures: async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return db("report_closures")
        .where({ client_id: id })
        .orderBy("period", "desc")
        .select(
          "id", "client_id", "period", "status",
          "closed_at", "closed_by", "reopened_at", "reopened_by", "reopen_reason",
          "superseded_by", "total_pages", "total_mono", "total_color"
        );
    },

    getClosure: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, closureId } = request.params as { id: string; closureId: string };
      const closure = await db("report_closures").where({ id: closureId, client_id: id }).first();
      if (!closure) return reply.status(404).send({ error: "Cierre no encontrado" });
      const lines = await db("report_closure_lines")
        .where({ closure_id: closureId })
        .orderBy("device_serial")
        .select("*");
      return { ...closure, lines };
    },

    reopenPeriodHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, closureId } = request.params as { id: string; closureId: string };
      const { reason } = request.body as { reason?: string };
      const owned = await db("report_closures").where({ id: closureId, client_id: id }).first();
      if (!owned) return reply.status(404).send({ error: "Cierre no encontrado" });
      if (owned.status !== "closed") {
        return reply.status(400).send({ error: "Sólo se puede reabrir un cierre en estado 'closed'" });
      }
      const user = currentUser(request);
      const updated = await reopenPeriod(db, {
        closureId,
        userId: user?.userId ?? null,
        reason: reason?.trim() || null,
        ipAddress: getClientIp(request),
      });
      return updated;
    },

    exportCsv: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, closureId } = request.params as { id: string; closureId: string };
      const closure = await db("report_closures").where({ id: closureId, client_id: id }).first();
      if (!closure) return reply.status(404).send({ error: "Cierre no encontrado" });
      const lines = await db("report_closure_lines")
        .where({ closure_id: closureId })
        .orderBy("device_serial")
        .select("*");

      const period = formatPeriod(closure.period);
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename=cierre_${period}_${closureId}.csv`)
        .send(buildClosureCsv(closure, lines));
    },

    exportXlsx: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, closureId } = request.params as { id: string; closureId: string };
      const closure = await db("report_closures").where({ id: closureId, client_id: id }).first();
      if (!closure) return reply.status(404).send({ error: "Cierre no encontrado" });
      const lines = await db("report_closure_lines")
        .where({ closure_id: closureId })
        .orderBy("device_serial")
        .select("*");

      const period = formatPeriod(closure.period);
      const buffer = await buildClosureXlsx(closure, lines);
      reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename=cierre_${period}_${closureId}.xlsx`)
        .send(buffer);
    },
  };
}
