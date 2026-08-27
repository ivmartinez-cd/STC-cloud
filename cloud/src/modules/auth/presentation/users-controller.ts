import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { PortalUser } from "../../../api/middlewares/authMiddleware";
import { getClientIp } from "../../../api/utils/ip";
import type { CreateUserBody, IdParams, UpdateUserBody } from "../domain/entities/auth-dtos";
import { KnexUserRepository } from "../infrastructure/database/knex-user-repository";
import { KnexUserAuditGateway } from "../infrastructure/adapters/knex-user-audit-gateway";
import { ListUsersUseCase, CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase } from "../application/use-cases/user-management-use-cases";
import { sendIfAuthError } from "./auth-error-mapping";

function currentUser(request: FastifyRequest): PortalUser {
  return (request as FastifyRequest & { user: PortalUser }).user;
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (currentUser(request).role !== "admin") {
    reply.status(403).send({ error: "No autorizado. Se requiere rol de administrador." });
    return false;
  }
  return true;
}

/** `user_id` de auditoría: nombre conservado del controller original —
 * "admin" es un actor sentinel legado, nunca el uuid real de un usuario. */
function auditActorId(user: PortalUser): string | null {
  return user.userId !== "admin" ? user.userId : null;
}

export function createAuthUserHandlers(db: Knex) {
  const repo = new KnexUserRepository(db);
  const listUsers = new ListUsersUseCase(repo);

  return {
    listUsers: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      return listUsers.execute();
    },

    createUser: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const user = currentUser(request);
      const { username, password, role, client_id, totp_required } = request.body as CreateUserBody;
      const createUser = new CreateUserUseCase(repo, new KnexUserAuditGateway(db, getClientIp(request)));
      try {
        return await createUser.execute(auditActorId(user), { username, password, role, clientId: client_id, totpRequired: totp_required });
      } catch (err) {
        if (sendIfAuthError(reply, err)) return reply;
        throw err;
      }
    },

    updateUser: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const user = currentUser(request);
      const { id } = request.params as IdParams;
      const { password, role, active, client_id, totp_required } = request.body as UpdateUserBody;
      const updateUser = new UpdateUserUseCase(repo, new KnexUserAuditGateway(db, getClientIp(request)));
      try {
        return await updateUser.execute(user.userId, id, { password, role, active, clientId: client_id, totpRequired: totp_required });
      } catch (err) {
        if (sendIfAuthError(reply, err)) return reply;
        throw err;
      }
    },

    deleteUser: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireAdmin(request, reply)) return;
      const user = currentUser(request);
      const { id } = request.params as IdParams;
      const deleteUser = new DeleteUserUseCase(repo, new KnexUserAuditGateway(db, getClientIp(request)));
      try {
        await deleteUser.execute(user.userId, id);
        return { success: true };
      } catch (err) {
        if (sendIfAuthError(reply, err)) return reply;
        throw err;
      }
    },
  };
}
