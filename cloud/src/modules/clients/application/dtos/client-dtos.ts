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
