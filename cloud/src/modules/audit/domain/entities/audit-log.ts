import type { AuditCategory } from "../../../../shared/domain/audit-action-catalog";

export type AuditTargetKind = "device" | "agent" | "client";

export interface AuditLogEntry {
  id: string;
  createdAt: Date;
  action: string;
  actionLabel: string;
  category: AuditCategory;
  targetId: string | null;
  targetKind: AuditTargetKind | null;
  targetLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  userId: string | null;
  userUsername: string | null;
  ipAddress: string | null;
  metadata: unknown;
}

export interface AuditActionSummary {
  action: string;
  label: string;
  category: AuditCategory;
  count: number;
}
