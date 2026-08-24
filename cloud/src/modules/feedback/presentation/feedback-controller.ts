import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { getClientIp } from "../../../api/utils/ip";
import { NotFoundError, UnauthorizedError } from "../../../shared/domain/errors";
import type { RequestingUser } from "../application/dtos/feedback-dtos";
import type { ListFeedbackUseCase } from "../application/use-cases/list-feedback";
import type { SubmitFeedbackUseCase } from "../application/use-cases/submit-feedback";
import type { UpdateFeedbackStatusUseCase } from "../application/use-cases/update-feedback-status";
import type { FeedbackStatus, FeedbackType } from "../domain/entities/feedback";
import { toListView, toSubmitView, toUpdateStatusView } from "./feedback-view";

interface SubmitFeedbackBody {
  type: FeedbackType;
  title: string;
  description: string;
  image_url?: string;
}

interface UpdateStatusBody {
  status: FeedbackStatus;
}

interface FeedbackUseCases {
  submit: SubmitFeedbackUseCase;
  list: ListFeedbackUseCase;
  updateStatus: UpdateFeedbackStatusUseCase;
}

function toRequestingUser(user: PortalUser): RequestingUser {
  return { userId: user.userId, username: user.username || "unknown", role: user.role };
}

// Mapea errores de aplicación (ver shared/domain/errors) al código HTTP que ya
// devolvía el controller original — mismo contrato externo, ahora centralizado.
function sendIfAppError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    reply.status(403).send({ error: error.message });
    return true;
  }
  if (error instanceof NotFoundError) {
    reply.status(404).send({ error: error.message });
    return true;
  }
  return false;
}

function buildSubmitHandler(fastify: FastifyInstance, useCase: SubmitFeedbackUseCase) {
  return async (request: FastifyRequest) => {
    const user = (request as FastifyRequest & { user: PortalUser }).user;
    const { type, title, description, image_url } = request.body as SubmitFeedbackBody;

    const feedback = await useCase.execute({
      requestingUser: toRequestingUser(user),
      type,
      title,
      description,
      imageUrl: image_url,
      ipAddress: getClientIp(request),
    });

    fastify.log.info(
      `[Feedback] ${type.toUpperCase()} reportado por ${user.username || "unknown"}: "${title}" (id=${feedback.id})`
    );
    return { success: true, feedback: toSubmitView(feedback) };
  };
}

function buildListHandler(useCase: ListFeedbackUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as FastifyRequest & { user: PortalUser }).user;
    try {
      return toListView(await useCase.execute(toRequestingUser(user)));
    } catch (error) {
      if (sendIfAppError(reply, error)) return reply;
      throw error;
    }
  };
}

function logStatusUpdated(fastify: FastifyInstance, id: string, status: FeedbackStatus, username: string) {
  fastify.log.info(`[Feedback] Estado de ${id} actualizado a ${status} por ${username}`);
}

function buildUpdateStatusHandler(fastify: FastifyInstance, useCase: UpdateFeedbackStatusUseCase) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as FastifyRequest & { user: PortalUser }).user;
    const { id } = request.params as { id: string };
    const { status } = request.body as UpdateStatusBody;
    const ipAddress = getClientIp(request);

    try {
      const requestingUser = toRequestingUser(user);
      const updated = await useCase.execute({ requestingUser, feedbackId: id, status, ipAddress });
      logStatusUpdated(fastify, id, status, requestingUser.username);
      return { success: true, feedback: toUpdateStatusView(updated) };
    } catch (error) {
      if (sendIfAppError(reply, error)) return reply;
      throw error;
    }
  };
}

export function createFeedbackController(fastify: FastifyInstance, useCases: FeedbackUseCases) {
  return {
    submit: buildSubmitHandler(fastify, useCases.submit),
    list: buildListHandler(useCases.list),
    updateStatus: buildUpdateStatusHandler(fastify, useCases.updateStatus),
  };
}
