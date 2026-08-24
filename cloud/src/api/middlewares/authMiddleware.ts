import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Knex } from "knex";
import Redis from "ioredis";
import { AgentService } from "../../modules/agents";
import { resolveApiKey } from "../../services/apiKeyService";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursConfig } from "../../services/businessHours";
import { policyFor } from "../policy/rolePolicy";
import {
  agentIdParamMatchesScope,
  clientIdParamMatchesScope,
  deviceIdParamMatchesScope,
  incidentIdParamMatchesScope,
  getRouteKey,
  getScope,
  isAgentIdParamRoute,
  isClientIdParamRoute,
  isDeviceIdParamRoute,
  isIncidentIdParamRoute,
  isSupplyRequestIdParamRoute,
  supplyRequestIdParamMatchesScope,
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

/** Cliente resuelto de una API key, inyectado en `request.apiKeyClient`. */
export interface ApiKeyClient {
  apiKeyId: string;
  clientId: string;
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

      const agent = await db("agents").where({ id: user.agentId }).select("status", "business_hours").first();
      if (!agent || agent.status === "revoked") {
        return reply.status(404).send({ error: "Agente no encontrado o revocado" });
      }

      // TZ resuelta acá (misma query que ya hacía este middleware para
      // chequear `revoked`, cero costo extra) para que ingestLogs/syncReadings
      // puedan interpretar timestamps naive DD/MM/YYYY de binarios de agente
      // viejos sin tener que volver a golpear la DB — ver businessHours.ts.
      const storedBusinessHours: BusinessHoursConfig | null =
        (typeof agent.business_hours === "string" ? JSON.parse(agent.business_hours) : agent.business_hours) ?? null;
      (request as FastifyRequest & { agentTimezone?: string }).agentTimezone =
        (storedBusinessHours ?? DEFAULT_BUSINESS_HOURS).timezone;

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

      // Fase 6.3: 2FA obligatorio por usuario. Con el flag y sin enrolar, la
      // sesión solo puede tocar las rutas de enrolamiento — enforcement
      // server-side, no un aviso de UI. `/me` y `/logout` quedan permitidos
      // para que el portal pueda mostrar quién sos y salir.
      if (user.totp_required && !user.totp_enabled) {
        const routeUrl = request.routeOptions.url ?? "";
        const enrollmentAllowed =
          routeUrl.startsWith("/api/v1/portal/2fa") ||
          routeUrl === "/api/v1/portal/me" ||
          routeUrl === "/api/v1/portal/logout";
        if (!enrollmentAllowed) {
          return reply.status(403).send({
            error: "Tu cuenta exige autenticación de dos factores — configurala para continuar",
            totp_enrollment_required: true,
          });
        }
      }
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

        // Antes de esta pasada ningún handler de /devices/:id* validaba
        // ownership (ver `deleteDevice`) — quedaba enteramente en manos del
        // allowlist de roles. Este chequeo central cubre toda subruta
        // presente y futura sin depender de que cada handler se acuerde.
        if (isDeviceIdParamRoute(routeUrl) && !(await deviceIdParamMatchesScope(db, request, scope))) {
          return reply.status(404).send({ error: "Dispositivo no encontrado" });
        }

        // Fase 11 del gap analysis vs HP SDS.
        if (isIncidentIdParamRoute(routeUrl) && !(await incidentIdParamMatchesScope(db, request, scope))) {
          return reply.status(404).send({ error: "Incidente no encontrado" });
        }

        // Fase 4.2 del gap analysis vs HP SDS (pedidos de consumibles).
        if (isSupplyRequestIdParamRoute(routeUrl) && !(await supplyRequestIdParamMatchesScope(db, request, scope))) {
          return reply.status(404).send({ error: "Pedido no encontrado" });
        }
      }
    } catch (err) {
      request.log.error(err, "Error evaluando RBAC en portalAuth");
      return reply.status(500).send({ error: "Error de autorización" });
    }
  }

  /**
   * Autenticación de la API pública (integración ERP) — header `X-Api-Key`,
   * NO JWT. Un actor estructuralmente distinto de agente/portal: no inyecta
   * `request.user` (eso rompería el RBAC de `portalAuth` de arriba, pensado
   * sólo para JWT de portal) sino `request.apiKeyClient`, que los
   * controladores de `publicApiController.ts` usan directo como scope fijo
   * (siempre `client_id = X`, nunca "todos").
   */
  async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const rawKey = request.headers["x-api-key"];
      if (!rawKey || Array.isArray(rawKey)) {
        return reply.status(401).send({ error: "Falta el header X-Api-Key" });
      }
      const resolved = await resolveApiKey(db, rawKey);
      if (!resolved) {
        return reply.status(401).send({ error: "API key inválida o revocada" });
      }
      (request as FastifyRequest & { apiKeyClient: ApiKeyClient }).apiKeyClient = resolved;
    } catch (err) {
      request.log.error(err, "Error evaluando API key");
      return reply.status(401).send({ error: "API key inválida" });
    }
  }

  return { agentAuth, portalAuth, apiKeyAuth };
}
