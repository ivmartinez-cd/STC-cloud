import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../services/agentService";
import { policyFor } from "../policy/rolePolicy";
import {
  agentIdParamMatchesScope,
  clientIdParamMatchesScope,
  getRouteKey,
  getScope,
  isAgentIdParamRoute,
  isClientIdParamRoute,
} from "../utils/scope";

// ─── Tipos de Autenticación Exportados ───────────────────────────────────────

/** Firma estándar de un hook de autenticación pre-handler de Fastify. */
export type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** Usuario del portal inyectado en `request.user` tras la autenticación. */
export interface PortalUser {
  userId: string;
  username?: string;
  role: string;
  active: boolean;
  /** Cliente al que está atado un `client_viewer`; `null` para admin/operator. */
  clientId: string | null;
}

/** Payload decodificado del JWT del agente. */
interface AgentJwtPayload {
  agentId?: string;
}

/** Payload decodificado del JWT del portal. */
interface PortalJwtPayload {
  role: string;
  userId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Crea los middlewares de autenticación JWT para rutas de agente y portal.
 * Implementa RBAC estricto: un token de agente no puede acceder a rutas de portal y viceversa.
 *
 * @param fastify - Instancia del servidor con plugin JWT registrado.
 * @param db - Conexión Knex para validar estado del agente/usuario.
 * @param redis - Cliente Redis para verificar blacklist de tokens revocados.
 * @param agentService - Servicio de agentes para consultas de blacklist.
 * @returns Objeto con hooks `agentAuth` y `portalAuth`.
 */
export function createAuthMiddleware(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService
) {
  async function agentAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const user = request.user as AgentJwtPayload;
      if (!user.agentId) {
        return reply.status(403).send({ error: "Token de portal no puede acceder a esta ruta" });
      }

      const { id } = request.params as { id?: string };
      if (id && id !== user.agentId) {
        return reply.status(403).send({ error: "No tiene permisos para acceder a este agente" });
      }

      const agent = await db("agents").where({ id: user.agentId }).select("status").first();
      if (!agent || agent.status === "revoked") {
        return reply.status(404).send({ error: "Agente no encontrado o revocado" });
      }

      const blacklisted = await agentService.isBlacklisted(redis, user.agentId);
      if (blacklisted) {
        return reply.status(401).send({ error: "Token revocado" });
      }
    } catch {
      return reply.status(401).send({ error: "Token inválido o expirado" });
    }
  }

  async function portalAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      let token = request.cookies?.stc_session;
      const usedCookie = !!token;
      if (!token) {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return reply.status(401).send({ error: "No autenticado" });
      }

      // CSRF (double-submit cookie): solo aplica cuando la autenticación vino de la
      // cookie de sesión. Un header Authorization explícito no puede ser forjado por
      // un sitio de terceros vía formulario/fetch cross-site, así que es inmune a CSRF.
      const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
      if (usedCookie && MUTATING_METHODS.has(request.method)) {
        const csrfCookie = request.cookies?.stc_csrf;
        const csrfHeader = request.headers["x-csrf-token"];
        if (!csrfCookie || csrfCookie !== csrfHeader) {
          return reply.status(403).send({ error: "Token CSRF inválido o ausente" });
        }
      }

      const decoded = fastify.jwt.verify<PortalJwtPayload>(token);
      if (decoded.role !== "portal") {
        return reply.status(403).send({ error: "Token de agente no puede acceder a esta ruta" });
      }

      // Validar si el usuario existe y está activo. Lookup determinista: antes era
      // `CAST(id AS TEXT) = ? OR username = ?` con `.first()` sin ORDER BY — con dos
      // ramas que pueden matchear filas distintas, qué fila "gana" quedaba a criterio
      // del planner. Cosmético mientras el rol no autorizaba nada; ahora que el rol
      // decide acceso entre clientes, la identidad resuelta tiene que ser determinista.
      // El camino por `username` se conserva explícito para tokens viejos firmados en
      // la era del login de respaldo por variable de entorno (`userId` no-UUID).
      const user = UUID_RE.test(decoded.userId)
        ? await db("users").where({ id: decoded.userId }).first()
        : await db("users").where({ username: decoded.userId }).first();

      if (!user) {
        return reply.status(401).send({ error: "Usuario no encontrado" });
      }

      if (!user.active) {
        return reply.status(401).send({ error: "Usuario desactivado" });
      }

      (request as FastifyRequest & { user: PortalUser }).user = {
        userId: user.id,
        username: user.username,
        role: user.role,
        active: user.active,
        clientId: user.client_id ?? null,
      };
    } catch {
      return reply.status(401).send({ error: "Token inválido o expirado" });
    }

    // ─── RBAC por cliente ─────────────────────────────────────────────────────
    // Deliberadamente FUERA del try/catch de arriba: ese catch traduce cualquier
    // excepción a 401 "token inválido", que sería engañoso para un fallo de
    // autorización (p.ej. la consulta de `agentIdParamMatchesScope` fallando). Un
    // error acá debe verse como lo que es — un 500 — no disfrazarse de sesión expirada.
    try {
      const user = (request as FastifyRequest & { user: PortalUser }).user;
      const policy = policyFor(user.role);

      // Eje ROL: cualquier `role` no registrado en `rolePolicy.ts` (typo, variante de
      // mayúsculas, dato legacy) se deniega — nunca se trata como "sin restricción".
      // Con las CHECK constraints de la migración esto no debería poder ocurrir en
      // producción, pero la autorización no depende de esa garantía externa.
      if (!policy) {
        return reply.status(403).send({ error: "Rol no reconocido" });
      }

      if (policy.scoped) {
        // Un client_viewer sin cliente asignado es un estado que la CHECK de la
        // migración ya debería impedir; igual se falla cerrado acá por si acaso.
        if (!user.clientId) {
          return reply.status(403).send({ error: "Usuario sin cliente asignado" });
        }

        const routeKey = getRouteKey(request);
        if (!policy.routes.has(routeKey)) {
          return reply.status(403).send({ error: "No tiene permisos para acceder a este recurso" });
        }

        // Ownership central del `:id` en rutas paramétricas de cliente/agente: así el
        // allowlist de rutas y el scoping de cada controlador no son dos mecanismos
        // que deban ser ambos correctos para no filtrar datos de otro cliente.
        const routeUrl = request.routeOptions.url ?? "";
        const scope = getScope(request);

        if (isClientIdParamRoute(routeUrl) && !clientIdParamMatchesScope(request, scope)) {
          return reply.status(404).send({ error: "Cliente no encontrado" });
        }

        if (isAgentIdParamRoute(routeUrl) && !(await agentIdParamMatchesScope(db, request, scope))) {
          return reply.status(404).send({ error: "Monitor no encontrado" });
        }
      }
    } catch (err) {
      request.log.error(err, "Error evaluando RBAC en portalAuth");
      return reply.status(500).send({ error: "Error de autorización" });
    }
  }

  return { agentAuth, portalAuth };
}
