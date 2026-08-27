export interface UserAuditPort {
  recordCreated(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void>;
  recordUpdated(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void>;
  recordDeleted(actorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void>;
}
