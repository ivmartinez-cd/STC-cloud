import type { FastifyRequest } from "fastify";
import type { PortalUser } from "../../middlewares/authMiddleware";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function currentUser(request: FastifyRequest): PortalUser | undefined {
  return (request as FastifyRequest & { user?: PortalUser }).user;
}
