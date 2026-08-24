import type { Knex } from "knex";
import type { EmailLogEntry, EmailLogWrite } from "../../domain/entities/email-log-entry";

const TABLE = "email_log";

export interface EmailLogListParams {
  clientId?: string;
  event?: string;
  status?: string;
  q?: string;
  limit: number;
  offset: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEntity(row: any): EmailLogEntry {
  return {
    id: row.id,
    clientId: row.client_id,
    event: row.event,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    error: row.error,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function applyFilters(q: Knex.QueryBuilder, params: EmailLogListParams): Knex.QueryBuilder {
  if (params.clientId) q.where("client_id", params.clientId);
  if (params.event) q.where("event", params.event);
  if (params.status) q.where("status", params.status);
  if (params.q) {
    const term = `%${params.q}%`;
    q.where((qb) => qb.whereILike("recipient", term).orWhereILike("subject", term));
  }
  return q;
}

export class KnexEmailLogRepository {
  constructor(private readonly db: Knex) {}

  /** Best-effort: jamás lanza — un fallo del log no debe frenar un envío. */
  async record(entry: EmailLogWrite): Promise<void> {
    try {
      await this.db(TABLE).insert({
        client_id: entry.clientId,
        event: entry.event,
        recipient: entry.recipient,
        subject: entry.subject.slice(0, 300),
        status: entry.status,
        error: entry.error ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      });
    } catch {
      // swallow — auditoría best-effort
    }
  }

  async list(params: EmailLogListParams): Promise<{ items: EmailLogEntry[]; total: number }> {
    const base = applyFilters(this.db(TABLE), params);
    const [{ count }] = await base.clone().count("* as count");
    const rows = await base.clone()
      .orderBy("created_at", "desc")
      .limit(Math.min(params.limit, 200))
      .offset(params.offset);
    return { items: rows.map(toEntity), total: Number(count) };
  }
}
