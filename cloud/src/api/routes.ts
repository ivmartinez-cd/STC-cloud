import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type Redis from "ioredis";
import type { AgentService } from "../modules/agents";
import type { AuthHook } from "./middlewares/authMiddleware";

import { registerAuthRoutes } from "./routes/authRoutes";
import { registerAgentRoutes } from "../modules/agents/presentation/agent-routes";
import { registerPortalAgentRoutes } from "../modules/agents/presentation/portal-agent-routes";
import { registerClientRoutes } from "../modules/clients/presentation/client-routes";
import { registerPublicApiRoutes } from "./routes/publicApiRoutes";
import { registerDeviceRoutes } from "../modules/devices/presentation/device-routes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerFeedbackRoutes } from "../modules/feedback/presentation/feedback-routes";
import { registerScheduledReportRoutes } from "../modules/scheduled-reports/presentation/scheduled-report-routes";
import { registerActivityViewRoutes } from "../modules/activity-views/presentation/activity-view-routes";
import { registerSupplyRequestRoutes } from "../modules/supply-requests/presentation/supply-request-routes";
import { registerMessageTemplateRoutes } from "../modules/message-templates/presentation/template-routes";
import { registerEmailLogRoutes } from "../modules/email-log/presentation/email-log-routes";
import { registerDeviceCostsRoutes } from "../modules/device-costs";
import { registerRemoteActionRoutes } from "../modules/remote-actions/presentation/remote-action-routes";
import { registerSystemSettingsRoutes } from "../modules/system-settings/presentation/system-settings-routes";
import { registerTwoFactorRoutes } from "../modules/two-factor/presentation/two-factor-routes";
import { registerReportRoutes } from "../modules/reports/presentation/report-routes";
import { registerAuditRoutes } from "../modules/audit/presentation/audit-routes";
import { registerAlertRoutes } from "../modules/alerts/presentation/alert-routes";
import { registerInventoryRoutes } from "../modules/inventory/presentation/inventory-routes";
import { registerSuppliesRoutes } from "./routes/suppliesRoutes";
import { registerIncidentRoutes } from "./routes/incidentRoutes";
import { CLIENT_VIEWER_ROUTES } from "./policy/rolePolicy";

interface AuthHooks {
  agentAuth: AuthHook;
  portalAuth: AuthHook;
  apiKeyAuth: AuthHook;
}

/**
 * Registra todas las rutas de negocio y valida, al terminar, que
 * `CLIENT_VIEWER_ROUTES` no nombre ninguna ruta inexistente (typo/ruta
 * renombrada sería una denegación SILENCIOSA en producción, indistinguible
 * de "el rol no tiene acceso") — aborta el arranque si encuentra alguna.
 */
export function registerAllRoutes(
  fastify: FastifyInstance,
  db: Knex,
  redis: Redis,
  agentService: AgentService,
  { agentAuth, portalAuth, apiKeyAuth }: AuthHooks
): void {
  // Recolecta toda ruta declarada (método + url) a medida que se registra, para
  // validar contra la allowlist de RBAC apenas termine el registro.
  const declaredRoutes = new Set<string>();
  fastify.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    for (const method of methods) {
      declaredRoutes.add(`${method} ${routeOptions.url}`);
    }
  });

  registerAuthRoutes(fastify, db, redis, agentService, agentAuth, portalAuth);
  registerAgentRoutes(fastify, redis, agentService, agentAuth);
  registerPortalAgentRoutes(fastify, db, redis, agentService, portalAuth);
  registerClientRoutes(fastify, db, portalAuth);
  registerDeviceRoutes(fastify, db, portalAuth);
  registerDashboardRoutes(fastify, db, agentService, portalAuth, redis);
  registerAlertRoutes(fastify, db, portalAuth);
  registerFeedbackRoutes(fastify, db, portalAuth);
  registerScheduledReportRoutes(fastify, db, portalAuth);
  registerActivityViewRoutes(fastify, db, portalAuth);
  registerSupplyRequestRoutes(fastify, db, portalAuth);
  registerMessageTemplateRoutes(fastify, db, portalAuth);
  registerEmailLogRoutes(fastify, db, portalAuth);
  registerDeviceCostsRoutes(fastify, db, portalAuth);
  registerRemoteActionRoutes(fastify, db, portalAuth);
  registerTwoFactorRoutes(fastify, db, portalAuth);
  registerReportRoutes(fastify, db, portalAuth);
  registerAuditRoutes(fastify, db, portalAuth);
  registerInventoryRoutes(fastify, db, portalAuth);
  registerSuppliesRoutes(fastify, db, portalAuth);
  registerIncidentRoutes(fastify, db, portalAuth);
  registerPublicApiRoutes(fastify, db, apiKeyAuth);
  registerSystemSettingsRoutes(fastify, db, portalAuth);

  const missingFromAllowlist = [...CLIENT_VIEWER_ROUTES].filter((r) => !declaredRoutes.has(r));
  if (missingFromAllowlist.length > 0) {
    fastify.log.error(
      `RBAC: rutas en CLIENT_VIEWER_ROUTES sin ruta real registrada: ${missingFromAllowlist.join(", ")}`
    );
    process.exit(1);
  }
}
