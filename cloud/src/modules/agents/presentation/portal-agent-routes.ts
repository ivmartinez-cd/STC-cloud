import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AuthHook } from "../../../api/middlewares/authMiddleware";
import { createDecommissionStaleDevicesHandler } from "../../devices";
import type { AgentService } from "../index";
import { createAgentDirectoryController } from "./agent-directory-controller";
import { createPortalAgentController } from "./portal-agent-controller";

/**
 * Shape de una entrada de `ip_ranges` — rango manual (`start`+`end`) O bloque
 * CIDR (`cidr`). Deliberadamente SIN `required`: el schema es sólo de forma;
 * la regla "exactamente uno de cidr o start+end" vive en `validateIpRangeSpecs()`.
 */
const ipRangeItemSchema = {
  type: "object",
  properties: {
    label: { type: ["string", "null"], maxLength: 100 },
    start: { type: "string", maxLength: 15 },
    end: { type: "string", maxLength: 15 },
    cidr: { type: "string", maxLength: 18 },
    exclude: { type: "array", maxItems: 32, items: { type: "string", maxLength: 15 } },
  },
};

/** Sólo forma/tipo (`null` explícito = reset al default); la regla de negocio vive en `validateBusinessHours()`. */
const businessHoursSchema = {
  type: ["object", "null"],
  properties: {
    timezone: { type: "string", maxLength: 64 },
    days: { type: "array", maxItems: 7, items: { type: "integer" } },
    start_hour: { type: "integer" },
    end_hour: { type: "integer" },
  },
};

const createAgentSchema = {
  body: {
    type: "object", required: ["clientId", "name"],
    properties: {
      clientId: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 100 },
      ip_ranges: { type: "array", maxItems: 20, items: ipRangeItemSchema },
      snmp_community: { type: "string", maxLength: 64 },
      scan_interval_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      business_hours: businessHoursSchema,
    },
  },
};

const updateConfigSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      ip_ranges: { type: "array", maxItems: 20, items: ipRangeItemSchema },
      snmp_community: { type: "string", maxLength: 64 },
      scan_interval_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      toner_warning_threshold: { type: "integer", minimum: 0, maximum: 100 },
      toner_critical_threshold: { type: "integer", minimum: 0, maximum: 100 },
      business_hours: businessHoursSchema,
    },
  },
};

// `EWS_PROXY` deliberadamente NO está en este enum: su única vía es el endpoint
// dedicado con su validación de allowlist/staleness/path.
const commandSchema = {
  body: {
    type: "object", required: ["type"],
    properties: { type: { type: "string", enum: ["FORCE_SCAN", "RESTART", "UPDATE_CONFIG", "STC_CONSOLE", "FORCE_UPDATE"] }, payload: { type: "object" } },
  },
};

const decommissionStaleSchema = {
  body: {
    type: "object", additionalProperties: false,
    properties: { inactiveDays: { type: "integer", minimum: 7, maximum: 365 }, dryRun: { type: "boolean" }, reason: { type: "string", maxLength: 500 } },
  },
};

// La validación fina de forma (v1/v2c vs v3) vive en `snmpCredentials.validateCredentials`, no en JSON Schema.
const snmpCredentialsSchema = {
  body: {
    type: "object", additionalProperties: false, required: ["credentials"],
    properties: {
      expected_rev: { type: "integer", minimum: 0 },
      credentials: {
        type: "array", maxItems: 8,
        items: {
          type: "object",
          properties: {
            ref: { type: "string" },
            version: { type: "string", enum: ["v1", "v2c", "v3"] },
            label: { type: ["string", "null"], maxLength: 100 },
            community: { type: "string", maxLength: 64 },
            username: { type: "string", maxLength: 64 },
            security_level: { type: "string", enum: ["noAuthNoPriv", "authNoPriv", "authPriv"] },
            auth_protocol: { type: "string", enum: ["md5", "sha", "sha224", "sha256", "sha384", "sha512"] },
            auth_key: { type: "string", maxLength: 256 },
            priv_protocol: { type: "string", enum: ["des", "aes", "aes256b", "aes256r"] },
            priv_key: { type: "string", maxLength: 256 },
          },
        },
      },
    },
  },
};

const remoteEwsSchema = { body: { type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } } };
const ewsProxySchema = {
  body: { type: "object", required: ["device_id", "path"], properties: { device_id: { type: "string", format: "uuid" }, path: { type: "string", minLength: 1, maxLength: 500 } } },
};

export function registerPortalAgentRoutes(fastify: FastifyInstance, db: Knex, redis: Redis, agentService: AgentService, portalAuth: AuthHook) {
  const ctrl = createPortalAgentController(fastify, redis, agentService.useCases);
  const decommissionStaleDevices = createDecommissionStaleDevicesHandler(db);
  const auth = { preHandler: portalAuth };

  // Listado hifi "Salud de nodos" (handoff 25/08/2026) — endpoints NUEVOS y
  // aparte de `GET /agents`: ese endpoint ya lo consumen `Monitors.tsx` y
  // `RemoteActions.tsx` (fuera de este alcance) además de tests de e2e/RBAC,
  // así que extenderlo en el lugar hubiera arriesgado romper esos contratos.
  const dirCtrl = createAgentDirectoryController(db, redis);
  fastify.get("/api/v1/agents/directory", { ...auth, handler: dirCtrl.listAgentDirectory });
  fastify.get("/api/v1/agents/summary", { ...auth, handler: dirCtrl.getAgentFleetSummary });
  fastify.get("/api/v1/agents/signal-buckets", { ...auth, handler: dirCtrl.getAgentSignalBuckets });

  fastify.get("/api/v1/agents", { ...auth, handler: ctrl.listAgents });
  fastify.get("/api/v1/agents/:id", { ...auth, handler: ctrl.getAgent });
  fastify.get("/api/v1/agents/:id/devices", { ...auth, handler: ctrl.getAgentDevices });
  // Handoff hifi "Monitor — detalle" (25/08/2026): tira de 6 métricas, conectividad
  // 30 días, licencia y tabla de equipos paginada/filtrada/ordenada. `activity` queda
  // deliberadamente FUERA de `CLIENT_VIEWER_ROUTES` (rolePolicy.ts) — expone quién
  // hizo qué (mismo criterio que excluir `/agents/:id/logs`).
  fastify.get("/api/v1/agents/:id/stats", { ...auth, handler: ctrl.getAgentStats });
  fastify.get("/api/v1/agents/:id/connectivity", { ...auth, handler: ctrl.getAgentConnectivity });
  fastify.get("/api/v1/agents/:id/activity", { ...auth, handler: ctrl.getAgentActivity });
  fastify.get("/api/v1/agents/:id/license", { ...auth, handler: ctrl.getAgentLicense });
  fastify.get("/api/v1/agents/:id/devices/directory", { ...auth, handler: ctrl.listAgentDeviceDirectory });
  fastify.post("/api/v1/agents", { ...auth, schema: createAgentSchema, handler: ctrl.createAgent });
  fastify.delete("/api/v1/agents/:id", { ...auth, handler: ctrl.deleteAgent });
  fastify.post("/api/v1/agents/:id/revoke", { ...auth, handler: ctrl.revokeAgent });
  fastify.post("/api/v1/agents/:id/regenerate-key", { ...auth, handler: ctrl.regenerateKey });
  fastify.post("/api/v1/agents/:id/command", { ...auth, schema: commandSchema, handler: ctrl.sendCommand });
  fastify.post("/api/v1/agents/:id/scan", { ...auth, handler: ctrl.triggerScan });
  fastify.get("/api/v1/agents/:id/logs", { ...auth, handler: ctrl.getLogs });
  fastify.get("/api/v1/agents/:id/logs/export", { ...auth, handler: ctrl.exportLogs });
  fastify.get("/api/v1/agents/:id/config", { ...auth, handler: ctrl.getConfig });
  fastify.put("/api/v1/agents/:id/config", { ...auth, schema: updateConfigSchema, handler: ctrl.updateConfig });
  // Reemplaza a `DELETE /devices/offline`: colgada de /agents/:id hereda el chequeo central de ownership. Da de baja, no borra.
  fastify.post("/api/v1/agents/:id/devices/decommission-stale", { ...auth, schema: decommissionStaleSchema, handler: decommissionStaleDevices });
  // Credenciales SNMP — deliberadamente NO en CLIENT_VIEWER_ROUTES (credenciales de la LAN completa del cliente).
  fastify.get("/api/v1/agents/:id/snmp-credentials", { ...auth, handler: ctrl.getSnmpCredentials });
  fastify.put("/api/v1/agents/:id/snmp-credentials", { ...auth, schema: snmpCredentialsSchema, handler: ctrl.updateSnmpCredentials });
  // Remote EWS por túnel sobre el WSS (Fase 2).
  fastify.put("/api/v1/agents/:id/remote-ews", { ...auth, schema: remoteEwsSchema, handler: ctrl.setRemoteEwsEnabled });
  // Más estricto que el resto (cada llamada dispara un round-trip real hacia la LAN del cliente).
  fastify.post("/api/v1/agents/:id/ews-proxy", { ...auth, schema: ewsProxySchema, config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, handler: ctrl.ewsProxy });
}
