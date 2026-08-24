/** Ver `cloud/src/services/auditCatalog.ts` — única fuente de verdad de labels/categorías. */
export type AuditCategory = 'device' | 'agent' | 'client' | 'security' | 'alert' | 'report' | 'user' | 'other';

export type AuditLogItem = {
  id: string;
  created_at: string;
  action: string;
  action_label: string;
  category: AuditCategory;
  target_id: string | null;
  target_kind: 'device' | 'agent' | 'client' | null;
  target_label: string | null;
  client_id: string | null;
  client_name: string | null;
  user_id: string | null;
  user_username: string | null;
  ip_address: string | null;
  metadata: unknown;
};

export type AuditLogsResponse = {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AuditActionOption = { action: string; label: string; category: AuditCategory; count: number };
