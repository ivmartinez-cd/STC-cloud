import type { Knex } from "knex";
import type { MessageTemplate, TemplateEvent } from "../../domain/entities/message-template";

const TABLE = "message_templates";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEntity(row: any): MessageTemplate {
  return {
    id: row.id,
    clientId: row.client_id,
    event: row.event,
    subject: row.subject,
    body: row.body,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class KnexTemplateRepository {
  constructor(private readonly db: Knex) {}

  async list(clientId: string | null): Promise<MessageTemplate[]> {
    const q = this.db(TABLE).orderBy("event");
    if (clientId) q.where("client_id", clientId);
    else q.whereNull("client_id");
    return (await q).map(toEntity);
  }

  async findByScopeAndEvent(clientId: string | null, event: TemplateEvent): Promise<MessageTemplate | null> {
    const q = this.db(TABLE).where("event", event);
    if (clientId) q.where("client_id", clientId);
    else q.whereNull("client_id");
    const row = await q.first();
    return row ? toEntity(row) : null;
  }

  /**
   * SELECT-then-INSERT/UPDATE explícito — no `.onConflict()` sobre el índice
   * de expresión, mismo criterio documentado en `upsertIncidentRule`.
   */
  async upsert(
    params: { clientId: string | null; event: TemplateEvent; subject: string; body: string },
    updatedBy: string | null
  ): Promise<MessageTemplate> {
    const existing = await this.findByScopeAndEvent(params.clientId, params.event);
    if (existing) {
      const [row] = await this.db(TABLE)
        .where({ id: existing.id })
        .update({ subject: params.subject, body: params.body, updated_by: updatedBy, updated_at: new Date() })
        .returning("*");
      return toEntity(row);
    }
    const [row] = await this.db(TABLE)
      .insert({
        client_id: params.clientId, event: params.event,
        subject: params.subject, body: params.body, updated_by: updatedBy,
      })
      .returning("*");
    return toEntity(row);
  }

  /** Borra el override — el evento vuelve a la plantilla global o al default. */
  async delete(id: string): Promise<boolean> {
    return (await this.db(TABLE).where({ id }).delete()) > 0;
  }
}
