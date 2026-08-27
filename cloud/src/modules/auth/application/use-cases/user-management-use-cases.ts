import { hashPassword } from "../../domain/services/password-hasher";
import type { UserListRow, UserRepository } from "../../domain/repositories/user-repository";
import type { UserAuditPort } from "../ports/user-audit-port";
import { UsernameTakenError, UserNotFoundError } from "../../domain/errors/auth-error";
import { ValidationError, BusinessRuleViolationError } from "../../../../shared/domain/errors";

export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}
  execute(): Promise<UserListRow[]> {
    return this.users.list();
  }
}

export interface CreateUserInput {
  username: string; password: string; role?: string; clientId?: string; totpRequired?: boolean;
}

export class CreateUserUseCase {
  constructor(private readonly users: UserRepository, private readonly audit: UserAuditPort) {}

  async execute(actorId: string | null, input: CreateUserInput): Promise<UserListRow> {
    if (!input.username || !input.password) {
      throw new ValidationError("Usuario y contraseña son requeridos");
    }
    const finalRole = input.role || "operator";
    // La CHECK de la migración rechazaría esto con un 23514 (500) si se dejara pasar
    // — mejor un 400 explícito acá. `client_id` sólo tiene sentido para
    // `client_viewer`; para otros roles se ignora (no queda un client_id residual).
    if (finalRole === "client_viewer" && !input.clientId) {
      throw new ValidationError("Un usuario client_viewer requiere client_id");
    }

    const username = input.username.trim().toLowerCase();
    if (await this.users.findByUsername(username)) {
      throw new UsernameTakenError();
    }

    const clientId = finalRole === "client_viewer" ? (input.clientId ?? null) : null;
    const created = await this.users.create({
      username, passwordHash: hashPassword(input.password), role: finalRole,
      clientId, totpRequired: input.totpRequired === true,
    });

    await this.audit.recordCreated(actorId, String(created.id), { username, role: finalRole, client_id: clientId });
    return created;
  }
}

export interface UpdateUserInput {
  password?: string; role?: string; active?: boolean; clientId?: string; totpRequired?: boolean;
}

export class UpdateUserUseCase {
  constructor(private readonly users: UserRepository, private readonly audit: UserAuditPort) {}

  async execute(actorId: string, targetId: string, input: UpdateUserInput): Promise<UserListRow> {
    const target = await this.users.findById(targetId);
    if (!target) throw new UserNotFoundError();

    if (target.id === actorId && input.active === false) {
      throw new BusinessRuleViolationError("No puedes desactivar tu propio usuario");
    }

    // Mismo chequeo que en create: el rol resultante (nuevo si se manda, si no
    // el que ya tenía) tiene que tener client_id cuando es client_viewer, y NO
    // arrastrar uno residual cuando deja de serlo.
    const finalRole = input.role ?? target.role;
    const finalClientId = input.clientId ?? target.client_id ?? undefined;
    if (finalRole === "client_viewer" && !finalClientId) {
      throw new ValidationError("Un usuario client_viewer requiere client_id");
    }

    const clientId = input.role !== undefined
      ? (input.role === "client_viewer" ? finalClientId ?? null : null)
      : (input.clientId !== undefined ? (finalRole === "client_viewer" ? input.clientId : null) : undefined);

    const updated = await this.users.update(targetId, {
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      role: input.role,
      clientId,
      active: input.active,
      totpRequired: input.totpRequired,
    });
    if (!updated) throw new UserNotFoundError();

    await this.audit.recordUpdated(actorId, targetId, {
      changes: { password_changed: !!input.password, role: input.role, active: input.active, client_id: clientId },
    });
    return updated;
  }
}

export class DeleteUserUseCase {
  constructor(private readonly users: UserRepository, private readonly audit: UserAuditPort) {}

  async execute(actorId: string, targetId: string): Promise<void> {
    const target = await this.users.findById(targetId);
    if (!target) throw new UserNotFoundError();
    if (target.id === actorId) {
      throw new BusinessRuleViolationError("No puedes eliminar tu propio usuario");
    }

    await this.audit.recordDeleted(actorId, targetId, { username: target.username, role: target.role });
    await this.users.delete(targetId);
  }
}
