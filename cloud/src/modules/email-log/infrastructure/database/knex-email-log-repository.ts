import type { Knex } from "knex";
import type { EmailLogEntry, EmailLogWrite } from "../../domain/entities/email-log-entry";
import type { EmailLogSummary } from "../../domain/entities/email-log-summary";

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

  /** Conteo por estado en la ventana `[from,to]` — sólo `status`, ya alcanza para el resumen. */
  private async countByStatus(from: Date, to: Date, clientId?: string): Promise<Record<string, number>> {
    const rows: Array<{ status: string; count: string }> = await this.db(TABLE)
      .whereBetween("created_at", [from, to])
      .modify((q) => { if (clientId) q.where("client_id", clientId); })
      .select("status").count("* as count").groupBy("status");
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }

  /** Estado ACTUAL de la cartera, no de la ventana — "cuántos clientes no
   * pueden recibir un aviso hoy" no depende de cuántos intentos hubo. */
  private async contactCoverage(clientId?: string): Promise<{ clientesSinContacto: number; clientesTotal: number }> {
    const base = this.db("clients").modify((q) => { if (clientId) q.where("id", clientId); });
    const [{ count: total }] = await base.clone().count("* as count");
    const [{ count: sinContacto }] = await base.clone().whereNull("notification_email").count("* as count");
    return { clientesSinContacto: Number(sinContacto), clientesTotal: Number(total) };
  }

  async summary(from: Date, to: Date, clientId?: string): Promise<EmailLogSummary> {
    const [byStatus, coverage] = await Promise.all([
      this.countByStatus(from, to, clientId),
      this.contactCoverage(clientId),
    ]);
    const intentos = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      intentos,
      entregados: byStatus.sent ?? 0,
      sinDestinatario: byStatus.skipped_no_recipient ?? 0,
      sinSmtp: byStatus.skipped_no_transport ?? 0,
      ...coverage,
      reintentos: 0,
    };
  }
}
