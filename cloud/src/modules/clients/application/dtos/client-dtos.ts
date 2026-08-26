import type { ClientContactFields } from "../../domain/entities/client";
import type { ClientUpdateBody } from "../../domain/services/client-rules";
import type { ClientScope } from "../../domain/repositories/client-repository";

export interface Actor {
  userId: string | null;
  ipAddress: string | null;
}

export interface CreateClientInput extends Actor {
  body: ClientContactFields;
}

export interface UpdateClientInput extends Actor {
  id: string;
  body: ClientUpdateBody;
}

export interface ListClientsInput {
  scope: ClientScope;
}

/** Query string cruda de `GET /clients/directory` — sin validar todavía (eso lo hace
 * el use case: valores fuera del enum caen al default, no 400 — mismo criterio
 * "tolerante" que `include` en `ListDevicesInput`). */
export interface ListClientDirectoryInput {
  scope: ClientScope;
  q?: string;
  segment?: string;
  sortField?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export interface PortfolioSummaryInput {
  scope: ClientScope;
}

/** Query string cruda de `GET /clients/:id/devices/directory` (handoff hifi "Cliente
 * — detalle", 25/08/2026) — mismo criterio "tolerante" que `ListClientDirectoryInput`. */
export interface ListClientDeviceDirectoryInput {
  clientId: string;
  q?: string;
  segment?: string;
  sortField?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export interface ClientMonitorsInput {
  clientId: string;
  scope: ClientScope;
}

export interface ClientDevicesInput {
  clientId: string;
  /** Query param `include`: `"decommissioned"` | `"all"` incluyen bajas; cualquier otro valor, sólo vivos. */
  include?: string;
}

export interface CreateApiKeyInput {
  clientId: string;
  name?: string;
  /** Ausente/`null` = sin vencimiento (comportamiento de siempre). */
  expiresInDays?: number | null;
}

export interface RevokeApiKeyInput {
  clientId: string;
  keyId: string;
}

export interface PutWebhookInput {
  clientId: string;
  url?: string;
  events?: string[];
  active?: boolean;
  regenerateSecret?: boolean;
}

export interface PendingDevicesListInput {
  clientId: string;
  limit?: string;
  offset?: string;
  q?: string;
  agentId?: string;
}

export interface PendingDevicesActionInput extends Actor {
  clientId: string;
  deviceIds?: string[];
  reason?: string;
}
