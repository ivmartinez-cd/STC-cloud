import type { FastifyReply, FastifyRequest } from "fastify";
import { getClientIp } from "../../../api/utils/ip";
import { getPortalUser } from "../../../api/utils/scope";
import { ReportError } from "../domain/errors/report-error";
import type { ClosePeriodUseCase } from "../application/use-cases/close-period";
import type { ExportClosureUseCase } from "../application/use-cases/export-closure";
import type { GetClosureUseCase } from "../application/use-cases/get-closure";
import type { ListClosuresUseCase } from "../application/use-cases/list-closures";
import type { PreviewPeriodUseCase } from "../application/use-cases/preview-period";
import type { ReopenPeriodUseCase } from "../application/use-cases/reopen-period";
import type { ExportFormat } from "../application/dtos/report-dtos";
import { toClosureDetailView, toClosureView } from "./report-view";

/**
 * Todas las rutas cuelgan de `/api/v1/clients/:id/reports*` — el ownership del
 * `:id` ya lo valida el gate de RBAC (`isClientIdParamRoute` en
 * `authMiddleware.ts`/`scope.ts`) antes de llegar acá, tanto para admin/operator
 * (sin restricción) como para `client_viewer` (sólo su propio cliente). Las
 * mutaciones no están en `CLIENT_VIEWER_ROUTES` — deny-by-default alcanza.
 */
export interface ReportUseCases {
  preview: PreviewPeriodUseCase;
  close: ClosePeriodUseCase;
  reopen: ReopenPeriodUseCase;
  list: ListClosuresUseCase;
  get: GetClosureUseCase;
  export: ExportClosureUseCase;
}

type Params = { id: string; closureId: string };

/** `ReportError` lleva su status; cualquier otra cosa sigue siendo un 500 de Fastify. */
async function replyingReportErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReportError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

/** Preview/close históricamente devolvían 400 con el mensaje ante CUALQUIER error (no sólo los de dominio). */
async function replying400<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReportError) return reply.status(err.statusCode).send({ error: err.message });
    return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
  }
}

function buildPreviewHandler(useCase: PreviewPeriodUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as Params;
    const { period } = request.query as { period?: string };
    if (!period) return reply.status(400).send({ error: "Falta el parámetro period (YYYY-MM)" });
    return replying400(reply, () => useCase.execute({ clientId: id, period }));
  };
}

function buildCloseHandler(useCase: ClosePeriodUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replying400(reply, async () => {
      const { id } = request.params as Params;
      const { period } = request.body as { period: string };
      const closure = await useCase.execute({
        clientId: id, period, userId: getPortalUser(request)?.userId ?? null, ipAddress: getClientIp(request),
      });
      return toClosureView(closure);
    });
}

function buildReopenHandler(useCase: ReopenPeriodUseCase) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replyingReportErrors(reply, async () => {
      const { id, closureId } = request.params as Params;
      const { reason } = request.body as { reason?: string };
      const updated = await useCase.execute({
        clientId: id, closureId, userId: getPortalUser(request)?.userId ?? null,
        reason: reason?.trim() || null, ipAddress: getClientIp(request),
      });
      return updated ? toClosureView(updated) : null;
    });
}

function buildExportHandler(useCase: ExportClosureUseCase, format: ExportFormat) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    replyingReportErrors(reply, async () => {
      const { id, closureId } = request.params as Params;
      const file = await useCase.execute({ clientId: id, closureId, format });
      return reply
        .header("Content-Type", file.contentType)
        .header("Content-Disposition", `attachment; filename=${file.filename}`)
        .send(file.body);
    });
}

export function createReportController(useCases: ReportUseCases) {
  return {
    previewPeriod: buildPreviewHandler(useCases.preview),
    closePeriodHandler: buildCloseHandler(useCases.close),
    listClosures: async (request: FastifyRequest) =>
      (await useCases.list.execute((request.params as Params).id)).map(toClosureView),
    getClosure: (request: FastifyRequest, reply: FastifyReply) =>
      replyingReportErrors(reply, async () => {
        const { id, closureId } = request.params as Params;
        return toClosureDetailView(await useCases.get.execute({ clientId: id, closureId }));
      }),
    reopenPeriodHandler: buildReopenHandler(useCases.reopen),
    exportCsv: buildExportHandler(useCases.export, "csv"),
    exportXlsx: buildExportHandler(useCases.export, "xlsx"),
    exportPdf: buildExportHandler(useCases.export, "pdf"),
  };
}
