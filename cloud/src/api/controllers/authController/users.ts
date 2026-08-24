import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { hashPassword } from "../../utils/password";
import type { PortalUser } from "../../middlewares/authMiddleware";
import { getClientIp } from "../../utils/ip";
import type { CreateUserBody, IdParams, UpdateUserBody } from "./shared";

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

async function listUsers(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;
  return await db("users")
    .leftJoin("clients", "clients.id", "users.client_id")
    .select(
      "users.id",
      "users.username",
      "users.role",
      "users.active",
      "users.client_id",
      "clients.name as client_name",
      "users.created_at",
      "users.updated_at"
    )
    .orderBy("users.username", "asc");
}

async function createUser(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;
  const user = currentUser(request);
  const { username, password, role, client_id, totp_required } = request.body as CreateUserBody & { totp_required?: boolean };

  if (!username || !password) {
    return reply.status(400).send({ error: "Usuario y contraseña son requeridos" });
  }

  const finalRole = role || "operator";
  // La CHECK de la migración rechazaría esto con un 23514 (500) si se dejara pasar
  // — mejor un 400 explícito acá. `client_id` sólo tiene sentido para
  // `client_viewer`; para otros roles se ignora (no queda un client_id residual).
  if (finalRole === "client_viewer" && !client_id) {
    return reply.status(400).send({ error: "Un usuario client_viewer requiere client_id" });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = await db("users").where({ username: cleanUsername }).first();
  if (existing) {
    return reply.status(409).send({ error: "El nombre de usuario ya existe" });
  }

  const [newUser] = await db("users")
    .insert({
      id: db.raw("gen_random_uuid()"),
      username: cleanUsername,
      password_hash: hashPassword(password),
      role: finalRole,
      client_id: finalRole === "client_viewer" ? client_id : null,
      active: true,
      totp_required: totp_required === true,
    })
    .returning(["id", "username", "role", "active", "client_id", "totp_required", "created_at"]);

  await db("audit_logs").insert({
    action: "USER_CREATED",
    target_id: String(newUser.id),
    user_id: user.userId !== "admin" ? user.userId : null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ username: cleanUsername, role: finalRole, client_id: newUser.client_id }),
  });

  return newUser;
}

function resolveUserUpdates(role: string | undefined, client_id: string | undefined, active: boolean | undefined, password: string | undefined, finalRole: string, finalClientId: string | undefined) {
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (password) {
    updates.password_hash = hashPassword(password);
  }
  if (role !== undefined) {
    updates.role = role;
    updates.client_id = role === "client_viewer" ? finalClientId : null;
  } else if (client_id !== undefined) {
    updates.client_id = finalRole === "client_viewer" ? client_id : null;
  }
  if (active !== undefined) {
    updates.active = active;
  }
  return updates;
}

async function updateUser(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;
  const user = currentUser(request);
  const { id } = request.params as IdParams;
  const { password, role, active, client_id, totp_required } = request.body as UpdateUserBody & { totp_required?: boolean };

  const target = await db("users").where({ id }).first();
  if (!target) {
    return reply.status(404).send({ error: "Usuario no encontrado" });
  }

  if (target.id === user.userId && active === false) {
    return reply.status(400).send({ error: "No puedes desactivar tu propio usuario" });
  }

  // Mismo chequeo que en createUser: el rol resultante (nuevo si se manda, si no
  // el que ya tenía) tiene que tener client_id cuando es client_viewer, y NO
  // arrastrar uno residual cuando deja de serlo.
  const finalRole = role ?? target.role;
  const finalClientId = client_id ?? target.client_id;
  if (finalRole === "client_viewer" && !finalClientId) {
    return reply.status(400).send({ error: "Un usuario client_viewer requiere client_id" });
  }

  const updates = resolveUserUpdates(role, client_id, active, password, finalRole, finalClientId);
  // Fase 6.3: el admin puede exigir 2FA por usuario (enforcement en authMiddleware).
  if (totp_required !== undefined) updates.totp_required = totp_required === true;

  const [updatedUser] = await db("users")
    .where({ id })
    .update(updates)
    .returning(["id", "username", "role", "active", "client_id", "totp_required", "updated_at"]);

  await db("audit_logs").insert({
    action: "USER_UPDATED",
    target_id: String(id),
    user_id: user.userId !== "admin" ? user.userId : null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ changes: { password_changed: !!password, role, active, client_id: updates.client_id } }),
  });

  return updatedUser;
}

async function deleteUser(db: Knex, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;
  const user = currentUser(request);
  const { id } = request.params as IdParams;

  const target = await db("users").where({ id }).first();
  if (!target) {
    return reply.status(404).send({ error: "Usuario no encontrado" });
  }

  if (target.id === user.userId) {
    return reply.status(400).send({ error: "No puedes eliminar tu propio usuario" });
  }

  await db("audit_logs").insert({
    action: "USER_DELETED",
    target_id: String(id),
    user_id: user.userId !== "admin" ? user.userId : null,
    ip_address: getClientIp(request),
    metadata: JSON.stringify({ username: target.username, role: target.role }),
  });

  await db("users").where({ id }).delete();
  return { success: true };
}

export function createAuthUserHandlers(db: Knex) {
  return {
    listUsers: (request: FastifyRequest, reply: FastifyReply) => listUsers(db, request, reply),
    createUser: (request: FastifyRequest, reply: FastifyReply) => createUser(db, request, reply),
    updateUser: (request: FastifyRequest, reply: FastifyReply) => updateUser(db, request, reply),
    deleteUser: (request: FastifyRequest, reply: FastifyReply) => deleteUser(db, request, reply),
  };
}
