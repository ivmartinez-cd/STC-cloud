export interface ListAuditLogsInput {
  from?: string;
  to?: string;
  action?: string;
  category?: string;
  clientId?: string;
  targetId?: string;
  userId?: string;
  excludeUserId?: string;
  limit?: string;
  offset?: string;
}
