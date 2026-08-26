import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import type { ActivitySavedViewRepository } from "../domain/repositories/activity-saved-view-repository";
import { ActivityViewValidationError, deleteActivityView, listActivityViews, saveActivityView } from "../application/use-cases/save-activity-view";
import { toViewDto } from "../application/dtos/activity-view-dtos";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function userIdOf(request: FastifyRequest): string {
  return (request as FastifyRequest & { user: PortalUser }).user.userId;
}

function buildList(repo: ActivitySavedViewRepository): Handler {
  return async (request) => (await listActivityViews(repo, userIdOf(request))).map(toViewDto);
}

function buildCreate(repo: ActivitySavedViewRepository): Handler {
  return async (request, reply) => {
    try {
      const created = await saveActivityView(repo, userIdOf(request), request.body as { name: unknown; filters: unknown });
      return reply.status(201).send(toViewDto(created));
    } catch (err) {
      if (err instanceof ActivityViewValidationError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  };
}

function buildRemove(repo: ActivitySavedViewRepository): Handler {
  return async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await deleteActivityView(repo, id, userIdOf(request));
    if (!deleted) return reply.status(404).send({ error: "Vista no encontrada" });
    return reply.status(204).send();
  };
}

export function createActivityViewController(repo: ActivitySavedViewRepository) {
  return { list: buildList(repo), create: buildCreate(repo), remove: buildRemove(repo) };
}
