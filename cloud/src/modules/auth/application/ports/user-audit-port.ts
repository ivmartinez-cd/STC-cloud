// `clientId` es el cliente al que pertenece el usuario AFECTADO (no el actor):
// es el que necesita el feed de auditoría para filtrar por cliente
// (ARCHITECTURE_GUIDE §8.8). `null` para roles que no son `client_viewer`, que
// no están scopeados a ningún cliente.
export interface UserAuditPort {
  recordCreated(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void>;
  recordUpdated(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void>;
  recordDeleted(actorId: string | null, targetId: string, clientId: string | null, metadata: Record<string, unknown>): Promise<void>;
}
