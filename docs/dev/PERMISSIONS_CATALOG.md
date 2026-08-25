# Catálogo de permisos por endpoint

Generado por `cloud/scripts/check-routes.mjs --write-catalog` — NO editar a mano; regenerar
al agregar/quitar rutas o cambiar `CLIENT_VIEWER_ROUTES` / `ADMIN_ONLY_ROUTES`.

Modelo (ver `cloud/src/api/policy/rolePolicy.ts`): toda ruta declara su `preHandler`
(`portalAuth` sesión del portal · `agentAuth` token de agente · `apiKeyAuth` API key de
cliente) o está en la allowlist explícita de rutas públicas. Dentro del portal,
`admin`/`operator` llegan a toda ruta con `portalAuth`; `client_viewer` es deny-by-default
y sólo llega a `CLIENT_VIEWER_ROUTES` (scopeado a su cliente). Las marcadas `admin`
además exigen `role === "admin"` en el handler.

Total: 152 rutas · públicas: 9 · client_viewer: 40 · sólo admin: 8

## `src/api/routes/authRoutes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| POST | `/api/v1/portal/login` | público |
| POST | `/api/v1/portal/logout` | público |
| GET | `/api/v1/portal/me` | admin · operator · client_viewer |
| POST | `/api/v1/portal/ws-ticket` | admin · operator |
| GET | `/api/v1/portal/users` | admin |
| POST | `/api/v1/portal/users` | admin |
| PUT | `/api/v1/portal/users/:id` | admin |
| DELETE | `/api/v1/portal/users/:id` | admin |
| POST | `/api/v1/agents/activate` | público |
| POST | `/api/v1/agents/refresh` | público |
| GET | `/api/v1/agents/version` | agente (token) |
| POST | `/api/v1/portal/agents/version` | admin |

## `src/api/routes/dashboardRoutes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/dashboard` | admin · operator · client_viewer |
| GET | `/api/v1/search` | admin · operator · client_viewer |

## `src/api/routes/incidentRoutes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/incidents` | admin · operator · client_viewer |
| GET | `/api/v1/incidents/stats` | admin · operator · client_viewer |
| GET | `/api/v1/incidents/:id` | admin · operator · client_viewer |
| POST | `/api/v1/incidents` | admin · operator |
| PATCH | `/api/v1/incidents/:id` | admin · operator |
| POST | `/api/v1/incidents/:id/status` | admin · operator |
| POST | `/api/v1/incidents/:id/close` | admin · operator |
| POST | `/api/v1/incidents/:id/reopen` | admin · operator |
| POST | `/api/v1/incidents/:id/comments` | admin · operator |
| POST | `/api/v1/incidents/:id/assign` | admin · operator |
| POST | `/api/v1/incidents/:id/alerts` | admin · operator |
| DELETE | `/api/v1/incidents/:id/alerts/:alertId` | admin · operator |
| GET | `/api/v1/clients/:id/incident-rules` | admin · operator |
| PUT | `/api/v1/clients/:id/incident-rules` | admin · operator |

## `src/api/routes/publicApiRoutes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/public/devices` | API key de cliente |
| GET | `/api/v1/public/devices/:id/readings` | API key de cliente |
| GET | `/api/v1/public/alerts` | API key de cliente |
| GET | `/api/v1/public/reports/closures` | API key de cliente |
| GET | `/api/v1/public/reports/closures/:id` | API key de cliente |
| GET | `/api/v1/public/webhook` | API key de cliente |
| PUT | `/api/v1/public/webhook` | API key de cliente |

## `src/api/routes/suppliesRoutes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/supplies` | admin · operator · client_viewer |
| GET | `/api/v1/supplies/summary` | admin · operator · client_viewer |

## `src/api/server.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/` | público |
| GET | `/health` | público |
| GET | `/api/v1/health` | público |
| GET | `/api/v1/agents/download-installer` | público |

## `src/modules/agents/presentation/agent-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/agents/:id/commands` | agente (token) |
| POST | `/api/v1/agents/:id/heartbeat` | agente (token) |
| POST | `/api/v1/devices/sync` | agente (token) |
| POST | `/api/v1/devices/register` | agente (token) |

## `src/modules/agents/presentation/portal-agent-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/agents` | admin · operator · client_viewer |
| GET | `/api/v1/agents/:id` | admin · operator · client_viewer |
| GET | `/api/v1/agents/:id/devices` | admin · operator · client_viewer |
| POST | `/api/v1/agents` | admin · operator |
| DELETE | `/api/v1/agents/:id` | admin · operator |
| POST | `/api/v1/agents/:id/revoke` | admin · operator |
| POST | `/api/v1/agents/:id/regenerate-key` | admin · operator |
| POST | `/api/v1/agents/:id/command` | admin · operator |
| POST | `/api/v1/agents/:id/scan` | admin · operator |
| GET | `/api/v1/agents/:id/logs` | admin · operator |
| GET | `/api/v1/agents/:id/logs/export` | admin · operator |
| GET | `/api/v1/agents/:id/config` | admin · operator |
| PUT | `/api/v1/agents/:id/config` | admin · operator |
| POST | `/api/v1/agents/:id/devices/decommission-stale` | admin · operator |
| GET | `/api/v1/agents/:id/snmp-credentials` | admin · operator |
| PUT | `/api/v1/agents/:id/snmp-credentials` | admin · operator |
| PUT | `/api/v1/agents/:id/remote-ews` | admin · operator |
| POST | `/api/v1/agents/:id/ews-proxy` | admin · operator |

## `src/modules/alerts/presentation/alert-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/alerts` | admin · operator · client_viewer |
| GET | `/api/v1/alerts/classes` | admin · operator · client_viewer |
| GET | `/api/v1/alerts/summary` | admin · operator · client_viewer |
| PUT | `/api/v1/alerts/:id` | admin · operator |
| POST | `/api/v1/alerts/bulk` | admin · operator |

## `src/modules/audit/presentation/audit-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/audit-logs` | admin · operator |
| GET | `/api/v1/audit-logs/actions` | admin · operator |

## `src/modules/clients/presentation/client-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| POST | `/api/v1/clients` | admin · operator |
| GET | `/api/v1/clients` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id` | admin · operator · client_viewer |
| PUT | `/api/v1/clients/:id` | admin · operator |
| GET | `/api/v1/clients/:id/monitors` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/usage` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/devices` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/pending-devices` | admin · operator |
| POST | `/api/v1/clients/:id/pending-devices/register` | admin · operator |
| POST | `/api/v1/clients/:id/pending-devices/ignore` | admin · operator |
| GET | `/api/v1/clients/:id/api-keys` | admin · operator |
| POST | `/api/v1/clients/:id/api-keys` | admin · operator |
| DELETE | `/api/v1/clients/:id/api-keys/:keyId` | admin · operator |
| GET | `/api/v1/clients/:id/webhook` | admin · operator |
| PUT | `/api/v1/clients/:id/webhook` | admin · operator |

## `src/modules/device-costs/presentation/device-costs-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/devices/:id/costs` | admin · operator |
| PUT | `/api/v1/devices/:id/costs` | admin · operator |

## `src/modules/devices/presentation/device-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/devices` | admin · operator · client_viewer |
| GET | `/api/v1/devices/duplicates` | admin · operator |
| GET | `/api/v1/devices/:id` | admin · operator · client_viewer |
| GET | `/api/v1/devices/:id/readings` | admin · operator · client_viewer |
| GET | `/api/v1/devices/:id/usage-history` | admin · operator · client_viewer |
| GET | `/api/v1/devices/:id/supplies` | admin · operator · client_viewer |
| PUT | `/api/v1/devices/:id` | admin · operator |
| POST | `/api/v1/devices/:id/decommission` | admin · operator |
| POST | `/api/v1/devices/:id/recommission` | admin · operator |
| POST | `/api/v1/devices/:id/move` | admin · operator |
| POST | `/api/v1/devices/:id/merge` | admin · operator |
| DELETE | `/api/v1/devices/:id` | admin · operator |
| PUT | `/api/v1/devices/:id/monitor-state` | admin · operator |
| POST | `/api/v1/devices/:id/unignore` | admin · operator |
| POST | `/api/v1/devices/bulk/decommission` | admin · operator |
| POST | `/api/v1/devices/bulk/recommission` | admin · operator |
| POST | `/api/v1/devices/bulk/move` | admin · operator |
| POST | `/api/v1/devices/bulk/monitor-state` | admin · operator |

## `src/modules/email-log/presentation/email-log-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/email-log` | admin · operator |

## `src/modules/feedback/presentation/feedback-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| POST | `/api/v1/feedback` | admin · operator · client_viewer |
| GET | `/api/v1/feedback` | admin |
| PUT | `/api/v1/feedback/:id/status` | admin |

## `src/modules/inventory/presentation/inventory-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/clients/:id/custom-fields` | admin · operator · client_viewer |
| POST | `/api/v1/clients/:id/custom-fields` | admin · operator |
| PUT | `/api/v1/clients/:id/custom-fields/:fieldId` | admin · operator |
| DELETE | `/api/v1/clients/:id/custom-fields/:fieldId` | admin · operator |
| GET | `/api/v1/device-models` | admin · operator · client_viewer |
| POST | `/api/v1/device-models` | admin · operator |
| PUT | `/api/v1/device-models/:id` | admin · operator |

## `src/modules/message-templates/presentation/template-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/message-templates` | admin · operator |
| PUT | `/api/v1/message-templates` | admin · operator |
| DELETE | `/api/v1/message-templates/:id` | admin · operator |

## `src/modules/metrics/http-metrics.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/metrics` | público |

## `src/modules/remote-actions/presentation/remote-action-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/remote-actions` | admin · operator |
| POST | `/api/v1/remote-actions` | admin · operator |
| GET | `/api/v1/remote-actions/:id` | admin · operator |
| POST | `/api/v1/remote-actions/:id/cancel` | admin · operator |

## `src/modules/reports/presentation/report-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/clients/:id/reports/preview` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/reports` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/reports/:closureId` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/reports/:closureId/export.csv` | admin · operator · client_viewer |
| GET | `/api/v1/clients/:id/reports/:closureId/export.xlsx` | admin · operator · client_viewer |
| POST | `/api/v1/clients/:id/reports/close` | admin · operator |
| POST | `/api/v1/clients/:id/reports/:closureId/reopen` | admin · operator |

## `src/modules/scheduled-reports/presentation/scheduled-report-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/scheduled-reports` | admin · operator |
| POST | `/api/v1/scheduled-reports` | admin · operator |
| PUT | `/api/v1/scheduled-reports/:id` | admin · operator |
| DELETE | `/api/v1/scheduled-reports/:id` | admin · operator |
| POST | `/api/v1/scheduled-reports/:id/run` | admin · operator |
| GET | `/api/v1/scheduled-reports/:id/download` | admin · operator |

## `src/modules/supply-requests/presentation/supply-request-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/supply-requests` | admin · operator · client_viewer |
| GET | `/api/v1/supply-requests/stats` | admin · operator · client_viewer |
| GET | `/api/v1/supply-requests/:id` | admin · operator · client_viewer |
| POST | `/api/v1/supply-requests` | admin · operator |
| POST | `/api/v1/supply-requests/:id/status` | admin · operator |
| POST | `/api/v1/supply-requests/:id/comments` | admin · operator |
| GET | `/api/v1/clients/:id/supply-request-settings` | admin · operator |
| PUT | `/api/v1/clients/:id/supply-request-settings` | admin · operator |

## `src/modules/system-settings/presentation/system-settings-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/settings/system` | admin · operator |
| PUT | `/api/v1/settings/system` | admin |

## `src/modules/two-factor/presentation/two-factor-routes.ts`

| Método | Ruta | Quién puede |
|---|---|---|
| GET | `/api/v1/portal/2fa/status` | admin · operator · client_viewer |
| POST | `/api/v1/portal/2fa/setup` | admin · operator · client_viewer |
| POST | `/api/v1/portal/2fa/enable` | admin · operator · client_viewer |
| POST | `/api/v1/portal/2fa/disable` | admin · operator · client_viewer |
| POST | `/api/v1/portal/2fa/recovery-codes` | admin · operator · client_viewer |
