import type { FastifyReply, FastifyRequest } from "fastify";
import type { ScheduledReportRepository } from "../domain/repositories/scheduled-report-repository";
import type { ReportRenderer } from "../application/ports/report-renderer";
import type { ReportMailer } from "../application/ports/report-mailer";
import { toViewDto, toTemplateView, type ScheduledReportInputDto } from "../application/dtos/scheduled-report-dtos";
import { REPORT_TEMPLATES } from "../domain/entities/report-templates";
import {
  createScheduledReport,
  ScheduledReportValidationError,
  updateScheduledReport,
} from "../application/use-cases/save-scheduled-report";
import {
  executeScheduledReport,
  renderScheduledReport,
} from "../application/use-cases/run-scheduled-report";

interface Deps {
  repo: ScheduledReportRepository;
  renderer: ReportRenderer;
  mailer: ReportMailer;
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

const NOT_FOUND = { error: "Informe no encontrado" };

function idOf(request: FastifyRequest): string {
  return (request.params as { id: string }).id;
}

function userIdOf(request: FastifyRequest): string | null {
  const user = (request as FastifyRequest & { user?: { userId?: string } }).user;
  return user?.userId ?? null;
}

function bodyOf(request: FastifyRequest): ScheduledReportInputDto {
  return request.body as ScheduledReportInputDto;
}

function sendValidationError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ScheduledReportValidationError) {
    return reply.status(400).send({ error: err.message });
  }
  throw err;
}

function buildList(deps: Deps): Handler {
  return async (_request, reply) => {
    const items = await deps.repo.list();
    return reply.send(items.map(toViewDto));
  };
}

function buildCreate(deps: Deps): Handler {
  return async (request, reply) => {
    try {
      const created = await createScheduledReport(deps.repo, bodyOf(request), userIdOf(request));
      return reply.status(201).send(toViewDto(created));
    } catch (err) {
      return sendValidationError(reply, err);
    }
  };
}

function buildUpdate(deps: Deps): Handler {
  return async (request, reply) => {
    try {
      const updated = await updateScheduledReport(deps.repo, idOf(request), bodyOf(request));
      if (!updated) return reply.status(404).send(NOT_FOUND);
      return reply.send(toViewDto(updated));
    } catch (err) {
      return sendValidationError(reply, err);
    }
  };
}

function buildRemove(deps: Deps): Handler {
  return async (request, reply) => {
    const deleted = await deps.repo.delete(idOf(request));
    if (!deleted) return reply.status(404).send(NOT_FOUND);
    return reply.status(204).send();
  };
}

function buildRunNow(deps: Deps): Handler {
  return async (request, reply) => {
    const report = await deps.repo.findById(idOf(request));
    if (!report) return reply.status(404).send(NOT_FOUND);
    const result = await executeScheduledReport(deps, report);
    const code = result.status === "ok" ? 200 : 502;
    return reply.status(code).send({ status: result.status, error: result.error, sent_to: report.recipients });
  };
}

function buildDownload(deps: Deps): Handler {
  return async (request, reply) => {
    const report = await deps.repo.findById(idOf(request));
    if (!report) return reply.status(404).send(NOT_FOUND);
    try {
      const file = await renderScheduledReport(deps.renderer, report);
      return reply
        .header("Content-Type", file.contentType)
        .header("Content-Disposition", `attachment; filename="${file.filename}"`)
        .send(file.content);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error generando el informe";
      return reply.status(400).send({ error: message });
    }
  };
}

function templates(): Handler {
  return async (_request, reply) => reply.send(REPORT_TEMPLATES.map(toTemplateView));
}

export function createScheduledReportController(deps: Deps) {
  return {
    list: buildList(deps),
    templates: templates(),
    create: buildCreate(deps),
    update: buildUpdate(deps),
    remove: buildRemove(deps),
    runNow: buildRunNow(deps),
    download: buildDownload(deps),
  };
}
